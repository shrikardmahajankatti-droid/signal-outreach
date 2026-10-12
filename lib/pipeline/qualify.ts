// Step 4: code gates G1–G5 against the live qualification_config. Writes reason codes,
// flags and a qualification_log row (with a config snapshot) for every startup evaluated.
import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getSetting, loadQualificationConfig, loadThesis } from "@/lib/config"
import { applyGates, type GateResult } from "@/lib/qualification/gates"
import type { Facts } from "@/lib/qualification/facts"
import type { StageResult } from "./runs"

const BATCH = 100

export async function runQualify(runId?: number): Promise<StageResult> {
  const db = getDb()
  const [cfg, thesis, demoRef] = await Promise.all([
    loadQualificationConfig(),
    loadThesis(),
    getSetting<string>("demo_reference_date"),
  ])
  const counts = { evaluated: 0, qualified: 0, rejected: 0, skipped: 0 }
  const errors: StageResult["errors"] = []

  const rows = await db.select().from(schema.startups).where(eq(schema.startups.stage, "extracted")).limit(BATCH)
  if (rows.length === 0) return { counts, errors }

  const ids = rows.map((r) => r.id)
  const domains = rows.map((r) => r.rootDomain).filter((d): d is string => !!d)
  const names = rows.map((r) => r.normalizedName)

  const [sources, contactedRows, dncRows, draftRows] = await Promise.all([
    db
      .select({ startupId: schema.startupSources.startupId, url: schema.articles.url, publishedAt: schema.articles.publishedAt })
      .from(schema.startupSources)
      .innerJoin(schema.articles, eq(schema.articles.id, schema.startupSources.articleId))
      .where(inArray(schema.startupSources.startupId, ids)),
    db
      .select({ rootDomain: schema.contacted.rootDomain, normalizedName: schema.contacted.normalizedName })
      .from(schema.contacted)
      .where(
        or(
          domains.length ? inArray(schema.contacted.rootDomain, domains) : undefined,
          and(isNull(schema.contacted.rootDomain), inArray(schema.contacted.normalizedName, names))
        )
      ),
    domains.length
      ? db.select({ rootDomain: schema.doNotContact.rootDomain }).from(schema.doNotContact).where(inArray(schema.doNotContact.rootDomain, domains))
      : Promise.resolve([] as { rootDomain: string | null }[]),
    db.select({ startupId: schema.drafts.startupId }).from(schema.drafts).where(inArray(schema.drafts.startupId, ids)),
  ])

  const contactedDomains = new Set(contactedRows.map((c) => c.rootDomain).filter(Boolean))
  const contactedNames = new Set(contactedRows.filter((c) => !c.rootDomain).map((c) => c.normalizedName))
  const dncDomains = new Set(dncRows.map((d) => d.rootDomain))
  const withDrafts = new Set(draftRows.map((d) => d.startupId))

  // Same knobs the gates read, snapshotted into every log row.
  const configSnapshot = { ...cfg, excluded_sectors: thesis.excludedSectors }

  for (const s of rows) {
    try {
      const facts = s.facts as Facts
      const mine = sources.filter((x) => x.startupId === s.id)
      const published = mine.map((x) => x.publishedAt?.getTime()).filter((t): t is number => !!t)
      // Demo data has a fixed clock so its decisions don't drift as real time passes.
      const now = s.isDemo && demoRef ? new Date(demoRef) : new Date()
      const result: GateResult = applyGates(facts, cfg, {
        now,
        firstSeenAt: published.length ? new Date(Math.min(...published)) : null,
        excludedSectors: thesis.excludedSectors,
        history: {
          contacted: (s.rootDomain && contactedDomains.has(s.rootDomain)) || (!s.rootDomain && contactedNames.has(s.normalizedName)),
          doNotContact: !!s.rootDomain && dncDomains.has(s.rootDomain),
          draftExists: withDrafts.has(s.id),
        },
      })
      const flags = [...new Set([...s.flags.filter((f) => f === "multi_source_merged"), ...result.flags])]

      await db
        .update(schema.startups)
        .set({
          decision: result.decision === "qualified" ? "pending" : result.decision,
          stage: result.decision === "qualified" ? "qualified" : "closed",
          reasonCodes: result.reasonCodes,
          flags,
          lastError: null,
        })
        .where(eq(schema.startups.id, s.id))
      await db.insert(schema.qualificationLog).values({
        startupId: s.id,
        companyDomain: s.rootDomain,
        decision: result.decision === "qualified" ? "accepted" : result.decision,
        phase: "gate",
        reasonCodes: result.reasonCodes,
        flags,
        sourceUrls: mine.map((x) => x.url),
        configSnapshot,
        runId: runId ?? null,
      })
      await db.insert(schema.events).values({
        startupId: s.id,
        type: result.decision === "qualified" ? "qualified" : result.decision,
        detail: { reasonCodes: result.reasonCodes, flags },
      })
      counts.evaluated++
      counts[result.decision]++
    } catch (err) {
      errors.push({ item: s.name, message: (err as Error).message })
      await db.update(schema.startups).set({ lastError: (err as Error).message }).where(eq(schema.startups.id, s.id))
    }
  }
  return { counts, errors }
}

