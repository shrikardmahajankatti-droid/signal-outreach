import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEMO_ITEMS, buildDemoArticles, demoReferenceDate, type DemoItem } from "@/lib/demo"
import { normalizeCompanyName, rootDomain, canonicalUrl } from "@/lib/domain"
import { applyGates, type GateConfig, type GateContext } from "@/lib/qualification/gates"
import { mergeFacts, normalizeStage, toUsd, type Facts } from "@/lib/qualification/facts"
import { parseQualificationMd } from "@/lib/qualification/parse-md"

// Gate config straight from qualification.md (section 7) plus the documented extensions.
const parsed = parseQualificationMd(readFileSync("qualification.md", "utf8"))
const md = Object.fromEntries(parsed.config.map((r) => [r.key, r.value])) as Record<string, unknown>
const CFG: GateConfig = {
  ...(md as unknown as GateConfig),
  soft_age_years: 5,
  flag_stages: ["pre-series a"],
  reject_mixed_debt_rounds: true,
}
const FX = { inr_per_usd: md.inr_per_usd as number }

function ctx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    now: new Date(demoReferenceDate()),
    firstSeenAt: null,
    excludedSectors: parsed.thesis.excludedSectors,
    history: { contacted: false, doNotContact: false, draftExists: false },
    ...overrides,
  }
}

function baseFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    is_funding_announcement: true,
    company_name: "Acme AI",
    company_domain: "acme.ai",
    round_stage: "seed",
    round_stage_raw: "seed",
    round_amount_usd: 1_500_000,
    round_amount_original: { amount: 1_500_000, currency: "USD" },
    announced_date: "2026-10-09",
    investors: ["Blume Ventures"],
    founders: [{ name: "Priya Rao", title: "CEO" }],
    employee_count: 12,
    employee_count_source: "article",
    founded_year: 2024,
    total_raised_usd: null,
    prior_rounds: [],
    is_public: false,
    parent_company: null,
    is_acquired: false,
    revenue_usd: null,
    sector: "B2B SaaS / AI",
    hq_country: "India",
    hq_city: "Bengaluru",
    business_model: null,
    what_they_do: null,
    use_of_funds: null,
    instrument: "equity",
    raiser_type: "startup",
    is_exit_event: false,
    is_traditional_sme: false,
    serial_founder_with_exit: null,
    excluded_sector_match: null,
    founder_quotes: [],
    ...overrides,
  }
}

// Facts as extraction reports them for a demo record: only what the record states.
function demoFacts(item: DemoItem, overrides: Partial<Facts> = {}): Facts {
  const stage = normalizeStage(item.round_label_in_press ?? item.round_stage)
  return baseFacts({
    company_name: item.company_name,
    company_domain: rootDomain(item.company_domain ?? null),
    round_stage: stage,
    round_stage_raw: item.round_stage,
    round_amount_usd: item.amount_inr ? toUsd(item.amount_inr, "INR", FX) : (item.amount_usd_reported ?? null),
    announced_date: item.announced_date,
    investors: item.investors ?? [],
    founders: (item.founders ?? []).map((f) => ({ name: f.name, title: f.title })),
    employee_count: null,
    employee_count_source: "unknown",
    founded_year: item.founded_year ?? null,
    sector: item.sector ?? null,
    hq_country: item.hq_country ?? null,
    hq_city: item.hq_city ?? null,
    instrument: /equity \+ debt/.test(item.round_stage) ? "mixed" : "equity",
    is_traditional_sme: null,
    ...overrides,
  })
}

const byName = (name: string) => DEMO_ITEMS.find((i) => i.company_name === name)!

describe("hard gates on the demo startups (qualification.md)", () => {
  const cases: [string, Partial<Facts>][] = [
    ["DailyObjects", {}],
    ["StockGro", {}],
    ["Lumio", {}],
    // Gemini names the matching excluded-sector list item; the code decides.
    ["NeoGrowth", { excluded_sector_match: "lending-only NBFCs" }],
    ["Healthleap", {}],
  ]

  for (const [name, overrides] of cases) {
    it(`rejects ${name} with ${byName(name).expected.reason_codes?.join(" + ")}`, () => {
      const item = byName(name)
      const result = applyGates(demoFacts(item, overrides), CFG, ctx())
      expect(result.decision).toBe("rejected")
      for (const code of item.expected.reason_codes ?? []) expect(result.reasonCodes).toContain(code)
    })
  }

  for (const name of ["Desible.ai", "CurvetAI", "Zomint", "Credfix", "CureMeAbroad", "The Dough Therapy", "Zinara"]) {
    it(`lets ${name} through the hard gates (fit is judged later)`, () => {
      const result = applyGates(demoFacts(byName(name)), CFG, ctx())
      expect(result.decision).toBe("qualified")
      expect(result.reasonCodes).toEqual([])
    })
  }

  it("flags CurvetAI's missing domain for enrichment", () => {
    expect(applyGates(demoFacts(byName("CurvetAI")), CFG, ctx()).flags).toContain("domain_to_enrich")
  })
})

describe("qualification.md section 10 test cases", () => {
  const now = new Date("2026-10-12T06:00:00Z")
  const yesterday = "2026-10-11"
  const run = (f: Partial<Facts>) => applyGates(baseFacts({ announced_date: yesterday, ...f }), CFG, ctx({ now }))

  it("#1 accepts a 2-year-old 12-person AI startup's $1.5M seed", () => {
    expect(run({}).decision).toBe("qualified")
  })
  it("#2 accepts a $3M pre-seed with unknown headcount, flagged size_unverified", () => {
    const r = run({ round_stage: "pre-seed", round_amount_usd: 3_000_000, employee_count: null, founded_year: 2025 })
    expect(r.decision).toBe("qualified")
    expect(r.flags).toContain("size_unverified")
  })
  it("#3 rejects a 15-year-old textile manufacturer", () => {
    const r = run({ founded_year: 2011, is_traditional_sme: true, round_stage: null, round_amount_usd: 3_500_000 })
    expect(r.reasonCodes).toEqual(expect.arrayContaining(["REJ_TOO_OLD", "REJ_TRADITIONAL_SME"]))
  })
  it("#4 rejects an 800-person company", () => {
    expect(run({ employee_count: 800 }).reasonCodes).toContain("REJ_TOO_MANY_EMPLOYEES")
  })
  it("#5 rejects a Tata-backed spin-off", () => {
    expect(run({ parent_company: "Tata Group", round_amount_usd: 4_000_000 }).reasonCodes).toContain("REJ_SUBSIDIARY")
  })
  it("#6 rejects a $20M Series A", () => {
    expect(run({ round_stage: "series a", round_amount_usd: 20_000_000 }).reasonCodes).toEqual(
      expect.arrayContaining(["REJ_LATE_STAGE", "REJ_ROUND_TOO_BIG"])
    )
  })
  it("#7 rejects venture debt", () => {
    expect(run({ instrument: "debt", round_stage: null }).reasonCodes).toContain("REJ_NON_EQUITY")
  })
  it("#8 rejects a round announced 45 days ago", () => {
    expect(run({ announced_date: "2026-08-28" }).reasonCodes).toContain("REJ_TOO_OLD_NEWS")
  })
  it("#9 skips when a draft already exists", () => {
    const r = applyGates(baseFacts({ announced_date: yesterday }), CFG, ctx({ now, history: { contacted: false, doNotContact: false, draftExists: true } }))
    expect(r).toMatchObject({ decision: "skipped", reasonCodes: ["SKIP_DRAFT_EXISTS"] })
  })
  it("#10 rejects a seed-stage betting app", () => {
    expect(run({ excluded_sector_match: "gambling/betting" }).reasonCodes).toContain("REJ_EXCLUDED_SECTOR")
  })
  it("#11 rejects a VC fund close", () => {
    expect(run({ raiser_type: "vc_fund" }).reasonCodes).toContain("REJ_FUND_NOT_STARTUP")
  })
  it("#12 accepts a 120-person 6-year-old pre-Series A with flags", () => {
    const r = run({ employee_count: 120, founded_year: 2020, round_stage: "pre-series a", round_amount_usd: 5_000_000 })
    expect(r.decision).toBe("qualified")
    expect(r.flags).toEqual(expect.arrayContaining(["large_team", "older_company", "check_stage"]))
  })
  it("skips companies already contacted or on do-not-contact", () => {
    const h = { contacted: true, doNotContact: true, draftExists: false }
    expect(applyGates(baseFacts({ announced_date: yesterday }), CFG, ctx({ now, history: h })).reasonCodes).toEqual([
      "SKIP_DO_NOT_CONTACT",
      "SKIP_ALREADY_CONTACTED",
    ])
  })
})

describe("Zomint: several articles about one round merge into one startup", () => {
  const zomint = byName("Zomint")
  const articles = buildDemoArticles().filter((a) => a.companies.includes("Zomint"))

  it("appears in three distinct source articles", () => {
    expect(articles).toHaveLength(zomint.sources.length)
    expect(new Set(articles.map((a) => canonicalUrl(a.url))).size).toBe(3)
  })

  it("every source resolves to the same dedupe key", () => {
    const keys = new Set(articles.map(() => normalizeCompanyName("Zomint")))
    keys.add(normalizeCompanyName("ZOMINT"))
    keys.add(normalizeCompanyName("Zomint Pvt Ltd"))
    expect(keys.size).toBe(1)
  })

  it("merging the facts keeps one round, unions investors and keeps the earliest date", () => {
    const a = demoFacts(zomint, { investors: ["Lightspeed (co-lead)"], announced_date: "2026-10-08" })
    const b = demoFacts(zomint, { investors: ["Prime Venture Partners"], announced_date: "2026-10-07", hq_city: "Gurugram" })
    const merged = mergeFacts(a, b)
    expect(merged.investors).toEqual(["Lightspeed (co-lead)", "Prime Venture Partners"])
    expect(merged.announced_date).toBe("2026-10-07")
    expect(merged.hq_city).toBe("Gurugram")
    expect(merged.round_stage).toBe("seed")
  })
})

describe("normalisation helpers", () => {
  it("normalises round labels", () => {
    expect(normalizeStage("Seed Plus")).toBe("seed extension")
    expect(normalizeStage("Pre-Series A")).toBe("pre-series a")
    expect(normalizeStage("series c")).toBe("series c")
    expect(normalizeStage("undisclosed (equity + debt)")).toBeNull()
    expect(normalizeStage("pre-seed")).toBe("pre-seed")
  })
  it("converts INR with the configured rate", () => {
    expect(toUsd(320_000_000, "INR", FX)).toBe(Math.round(320_000_000 / 85))
  })
  it("extracts root domains", () => {
    expect(rootDomain("https://www.app.acme.co.in/about")).toBe("acme.co.in")
    expect(rootDomain("desible.ai")).toBe("desible.ai")
  })
  it("normalises company names for dedupe", () => {
    expect(normalizeCompanyName("Desible.ai")).toBe(normalizeCompanyName("Desible AI"))
    expect(normalizeCompanyName("CurvetAI")).toBe(normalizeCompanyName("Curvet AI Technologies Pvt Ltd"))
  })
})

// Checks what the real pipeline (Gemini extraction + code gates) wrote to Neon after
// `npm run seed:demo`. Opt in with RUN_DB_TESTS=1.
describe.skipIf(!process.env.RUN_DB_TESTS || !process.env.DATABASE_URL)("demo results in Neon", async () => {
  const { getDb, schema } = await import("@/db")
  const { eq, inArray, sql } = await import("drizzle-orm")

  it("rejects every hard-gate demo company with the expected reason codes", async () => {
    const names = ["DailyObjects", "StockGro", "Lumio", "NeoGrowth", "Healthleap"]
    const rows = await getDb()
      .select()
      .from(schema.startups)
      .where(inArray(schema.startups.normalizedName, names.map(normalizeCompanyName)))
    for (const name of names) {
      const row = rows.find((r) => r.normalizedName === normalizeCompanyName(name))
      expect(row, name).toBeDefined()
      expect(row!.decision, name).toBe("rejected")
      for (const code of byName(name).expected.reason_codes ?? []) expect(row!.reasonCodes, name).toContain(code)
    }
  })

  it("stores Zomint once, with all its sources attached", async () => {
    const rows = await getDb().select().from(schema.startups).where(eq(schema.startups.normalizedName, "zomint"))
    expect(rows).toHaveLength(1)
    const [{ n }] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.startupSources)
      .where(eq(schema.startupSources.startupId, rows[0].id))
    expect(n).toBeGreaterThanOrEqual(3)
    expect(rows[0].flags).toContain("multi_source_merged")
  })
})

describe("merging never introduces a hard-gate fact", () => {
  it("keeps the excluded-sector judgement from the extraction the gates ran on", () => {
    const base = demoFacts(byName("Credfix"))
    const later = demoFacts(byName("Credfix"), { excluded_sector_match: "lending-only NBFCs" })
    expect(mergeFacts(base, later).excluded_sector_match).toBeNull()
  })
})

describe("cron schedule end date", async () => {
  const { scheduleEnded } = await import("@/lib/pipeline/schedule")
  it("runs through 30 Nov 2026 IST and stops from 1 Dec", () => {
    const prev = process.env.CRON_END_DATE
    process.env.CRON_END_DATE = "2026-11-30"
    expect(scheduleEnded(new Date("2026-11-30T00:30:00Z")).ended).toBe(false) // 6:00 IST on 30 Nov
    expect(scheduleEnded(new Date("2026-11-30T18:29:00Z")).ended).toBe(false) // 23:59 IST on 30 Nov
    expect(scheduleEnded(new Date("2026-11-30T18:31:00Z")).ended).toBe(true) // 00:01 IST on 1 Dec
    process.env.CRON_END_DATE = prev
  })
})
