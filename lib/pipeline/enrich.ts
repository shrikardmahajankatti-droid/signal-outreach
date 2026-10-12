// Step 5: research each qualified startup with Jina (website) and Tavily (domain, founder
// LinkedIn URLs, public posts/quotes, company size). ~3 Tavily credits per startup.
import { and, eq, ne } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { loadQualificationConfig } from "@/lib/config"
import { readWithJina } from "@/lib/http"
import { findEmployeeBand, matchFounderLinkedIn, pickCompanyDomain } from "@/lib/research/match"
import { tavilySearch, type TavilyResult } from "@/lib/research/tavily"
import type { Facts } from "@/lib/qualification/facts"
import type { StageResult } from "./runs"

const BATCH = 30
const CONCURRENCY = 3
const TIME_BUDGET_MS = 200_000

export type Research = {
  website: { url: string; excerpt: string } | null
  domain_source: "article" | "search" | null
  founder_posts: { text: string; url: string; source: string }[]
  employee_band: { min: number; max: number; source: string } | null
  searches: { query: string; results: { title: string; url: string; snippet: string }[] }[]
  researched_at: string
}

const slim = (rs: TavilyResult[]) => rs.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 300) }))

async function safeSearch(query: string, opts: Parameters<typeof tavilySearch>[1], log: Research["searches"]) {
  try {
    const results = await tavilySearch(query, opts)
    log.push({ query, results: slim(results) })
    return results
  } catch (err) {
    log.push({ query, results: [] })
    throw err
  }
}

async function enrichOne(s: typeof schema.startups.$inferSelect, cfg: Awaited<ReturnType<typeof loadQualificationConfig>>) {
  const db = getDb()
  const facts = s.facts as Facts
  const flags = new Set(s.flags)
  const searches: Research["searches"] = []
  const name = facts.company_name
  let domain = s.rootDomain
  let domainSource: Research["domain_source"] = domain ? "article" : null

  // 1. Company domain, when the article didn't give one.
  if (!domain) {
    const hint = [facts.sector?.split("/")[0], facts.hq_country].filter(Boolean).join(" ")
    const results = await safeSearch(`"${name}" ${hint} startup official website`, { maxResults: 6 }, searches)
    const pick = pickCompanyDomain(name, results)
    if (pick) {
      const [taken] = await db
        .select({ id: schema.startups.id })
        .from(schema.startups)
        .where(and(eq(schema.startups.rootDomain, pick.domain), ne(schema.startups.id, s.id)))
      if (taken) flags.add("domain_conflict")
      else {
        domain = pick.domain
        domainSource = "search"
        flags.delete("domain_to_enrich")
      }
    }
  }

  // 2. Founder LinkedIn URLs + LinkedIn company-size band (one search).
  const linkedin = await safeSearch(`"${name}" founder LinkedIn`, { maxResults: 8, includeDomains: ["linkedin.com"] }, searches)
  let founders = facts.founders
  if (founders.length === 0) {
    // Research can name founders the article didn't (LinkedIn titles like "Founder at Acme").
    founders = linkedin
      .filter((r) => /linkedin\.com\/in\//.test(r.url) && /founder|ceo/i.test(r.title) && r.title.toLowerCase().includes(name.toLowerCase().split(/[ .]/)[0]))
      .slice(0, 3)
      .map((r) => ({ name: r.title.split(/[-–|]/)[0].trim(), title: "Founder" }))
  }
  for (const f of founders.slice(0, 4)) {
    const match = matchFounderLinkedIn(f, name, linkedin)
    await db
      .insert(schema.founders)
      .values({ startupId: s.id, name: f.name, title: f.title, linkedinUrl: match?.url ?? null, linkedinMatchConfidence: match?.confidence ?? null })
      .onConflictDoUpdate({
        target: [schema.founders.startupId, schema.founders.name],
        set: { title: f.title, linkedinUrl: match?.url ?? null, linkedinMatchConfidence: match?.confidence ?? null },
      })
  }

  const band = findEmployeeBand(linkedin)
  let rejectCode: string | null = null
  if (band) {
    if (band.min > cfg.max_employees) rejectCode = "REJ_TOO_MANY_EMPLOYEES"
    else if (band.min > cfg.soft_employee_flag) flags.add("large_team")
    if (band.max <= cfg.soft_employee_flag) flags.delete("size_unverified")
  }

  // 3. Public posts, interviews and quotes for the opener.
  const people = founders.slice(0, 2).map((f) => `"${f.name}"`).join(" OR ")
  const postResults = await safeSearch(
    `${people ? `(${people}) ` : ""}"${name}" founder post OR interview OR said`,
    { maxResults: 5 },
    searches
  )
  const founderPosts = postResults
    .filter((r) => r.content.length > 60)
    .map((r) => ({ text: r.content.slice(0, 500), url: r.url, source: new URL(r.url).hostname.replace(/^www\./, "") }))

  // 4. Website text (Jina Reader).
  let website: Research["website"] = null
  if (domain) {
    try {
      const md = await readWithJina(`https://${domain}`, 20000)
      const body = (md.split("Markdown Content:")[1] ?? md).replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim()
      website = { url: `https://${domain}`, excerpt: body.slice(0, 3000) }
    } catch {
      flags.add("website_unreachable")
    }
  }

  // Identity (G1): name + (domain or founder). Research had its chance; now it's a hard rule.
  if (!domain && founders.length === 0) rejectCode = rejectCode ?? "REJ_UNIDENTIFIABLE"
  flags.delete("identity_to_enrich")

  const research: Research = {
    website,
    domain_source: domainSource,
    founder_posts: founderPosts,
    employee_band: band,
    searches,
    researched_at: new Date().toISOString(),
  }
  const updatedFacts: Facts = {
    ...facts,
    company_domain: domain,
    founders,
    ...(band && facts.employee_count === null ? { employee_count_source: "linkedin" as const } : {}),
  }

  await db
    .update(schema.startups)
    .set({
      rootDomain: domain,
      facts: updatedFacts,
      research,
      flags: [...flags],
      stage: rejectCode ? "closed" : "enriched",
      decision: rejectCode ? "rejected" : s.decision,
      reasonCodes: rejectCode ? [rejectCode] : s.reasonCodes,
      lastError: null,
    })
    .where(eq(schema.startups.id, s.id))
  await db.insert(schema.events).values({
    startupId: s.id,
    type: rejectCode ? "rejected" : "researched",
    detail: { domain, founders: founders.length, posts: founderPosts.length, band, rejectCode },
  })
  if (rejectCode) {
    await db.insert(schema.qualificationLog).values({
      startupId: s.id,
      companyDomain: domain,
      decision: "rejected",
      phase: "gate",
      reasonCodes: [rejectCode],
      flags: [...flags],
    })
  }
  return rejectCode ? "rejected" : "enriched"
}

export async function runEnrich(deadline = Date.now() + TIME_BUDGET_MS): Promise<StageResult> {
  const stopAt = Math.min(Date.now() + TIME_BUDGET_MS, deadline)
  const db = getDb()
  const cfg = await loadQualificationConfig()
  const counts = { enriched: 0, rejected: 0, failed: 0, deferred: 0 }
  const errors: StageResult["errors"] = []
  const rows = await db
    .select()
    .from(schema.startups)
    .where(and(eq(schema.startups.stage, "qualified"), eq(schema.startups.decision, "pending")))
    .limit(BATCH)

  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const s = rows[next++]
        if (Date.now() > stopAt) {
          counts.deferred++
          continue
        }
        try {
          const outcome = await enrichOne(s, cfg)
          counts[outcome]++
        } catch (err) {
          counts.failed++
          errors.push({ item: s.name, message: (err as Error).message })
          await db.update(schema.startups).set({ lastError: (err as Error).message }).where(eq(schema.startups.id, s.id))
        }
      }
    })
  )
  return { counts, errors }
}
