import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getSetting } from "@/lib/config"
import { hubspotDealUrl, type HubSpotAccount } from "@/lib/hubspot"
import type { Evidence, Facts } from "@/lib/qualification/facts"
import type { Research } from "@/lib/pipeline/enrich"

export const DECISION_FILTERS = ["all", "accepted", "maybe", "pending", "skipped", "rejected"] as const
export type DecisionFilter = (typeof DECISION_FILTERS)[number]

export async function listLeads(opts: { decision: DecisionFilter; showRejected: boolean; q?: string }) {
  const db = getDb()
  const conds = []
  if (opts.decision !== "all") conds.push(eq(schema.startups.decision, opts.decision))
  else if (!opts.showRejected) conds.push(ne(schema.startups.decision, "rejected"))
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`
    const founderMatches = db
      .select({ id: schema.founders.startupId })
      .from(schema.founders)
      .where(ilike(schema.founders.name, like))
    conds.push(or(ilike(schema.startups.name, like), ilike(schema.startups.rootDomain, like), inArray(schema.startups.id, founderMatches)))
  }
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: schema.startups.id,
        name: schema.startups.name,
        domain: schema.startups.rootDomain,
        decision: schema.startups.decision,
        stage: schema.startups.stage,
        fitScore: schema.startups.fitScore,
        facts: schema.startups.facts,
        flags: schema.startups.flags,
        reasonCodes: schema.startups.reasonCodes,
        isDemo: schema.startups.isDemo,
        updatedAt: schema.startups.updatedAt,
        draftStatus: schema.drafts.status,
      })
      .from(schema.startups)
      .leftJoin(schema.drafts, eq(schema.drafts.startupId, schema.startups.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(sql`${schema.startups.fitScore} desc nulls last`, desc(schema.startups.updatedAt))
      .limit(300),
    db.select({ decision: schema.startups.decision, n: sql<number>`count(*)::int` }).from(schema.startups).groupBy(schema.startups.decision),
  ])
  return {
    rows: rows.map((r) => {
      const f = r.facts as Facts
      return { ...r, round: f.round_stage_raw ?? f.round_stage, amountUsd: f.round_amount_usd, investors: f.investors, sector: f.sector }
    }),
    counts: Object.fromEntries(counts.map((c) => [c.decision, c.n])) as Record<string, number>,
  }
}

export async function getLead(id: number) {
  const db = getDb()
  const [s] = await db.select().from(schema.startups).where(eq(schema.startups.id, id))
  if (!s) return null
  const [founders, sources, events, [draft], feedback, account, log] = await Promise.all([
    db.select().from(schema.founders).where(eq(schema.founders.startupId, id)).orderBy(asc(schema.founders.id)),
    db
      .select({ url: schema.articles.url, title: schema.articles.title, source: schema.articles.source, publishedAt: schema.articles.publishedAt, isDemo: schema.articles.isDemo })
      .from(schema.startupSources)
      .innerJoin(schema.articles, eq(schema.articles.id, schema.startupSources.articleId))
      .where(eq(schema.startupSources.startupId, id))
      .orderBy(asc(schema.articles.publishedAt)),
    db.select().from(schema.events).where(eq(schema.events.startupId, id)).orderBy(asc(schema.events.createdAt)),
    db.select().from(schema.drafts).where(eq(schema.drafts.startupId, id)),
    db.select().from(schema.feedback).where(eq(schema.feedback.startupId, id)).orderBy(desc(schema.feedback.createdAt)),
    getSetting<HubSpotAccount>("hubspot_account"),
    db.select().from(schema.qualificationLog).where(eq(schema.qualificationLog.startupId, id)).orderBy(desc(schema.qualificationLog.createdAt)),
  ])
  const fitLog = log.find((l) => l.phase === "fit")
  return {
    startup: s,
    facts: s.facts as Facts,
    evidence: s.evidence as Evidence,
    research: s.research as Research | null,
    founders,
    sources,
    events,
    draft: draft ?? null,
    feedback,
    hubspotUrl: hubspotDealUrl(s.hubspotDealId, account),
    factorScores: (fitLog?.configSnapshot as { factor_scores?: Record<string, number> } | null)?.factor_scores ?? null,
  }
}
export type Lead = NonNullable<Awaited<ReturnType<typeof getLead>>>
