// Step 3: Gemini reads each new article and returns structured facts with evidence.
// Facts are merged into one startup row per company (root domain, else normalised name).
import { and, eq, inArray, like, lt, or, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { loadQualificationConfig, loadThesis } from "@/lib/config"
import { normalizeCompanyName } from "@/lib/domain"
import { generateJson } from "@/lib/gemini"
import { readWithJina } from "@/lib/http"
import {
  EXTRACT_SYSTEM,
  buildExtractPrompt,
  extractResponseSchema,
  extractZod,
  type ExtractInput,
  type ExtractedAnnouncement,
} from "@/lib/prompts/extract"
import {
  factsFromExtraction,
  hardFactsChanged,
  mergeEvidence,
  mergeFacts,
  type Evidence,
  type Facts,
  type FxConfig,
} from "@/lib/qualification/facts"
import type { StageResult } from "./runs"

const BATCH_SIZE = 5 // articles per Gemini call (qualification.md / spec)
const CONCURRENCY = 3
const MAX_ATTEMPTS = 3
const TIME_BUDGET_MS = 200_000
const MAX_TEXT_CHARS = 12_000

type ArticleRow = typeof schema.articles.$inferSelect

async function ensureText(a: ArticleRow): Promise<string> {
  if (a.rawText && a.rawText.length > 400) return a.rawText
  if (!a.isDemo && a.sourceType !== "portfolio") {
    try {
      const md = await readWithJina(a.url, 20000)
      const body = md.split("Markdown Content:")[1] ?? md
      if (body.trim().length > 200) {
        const text = body.trim().slice(0, 30000)
        await getDb().update(schema.articles).set({ rawText: text }).where(eq(schema.articles.id, a.id))
        return text
      }
    } catch {
      // Fall back to the feed snippet.
    }
  }
  return [a.rawText, a.snippet].filter(Boolean).join("\n\n") || a.title
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

function sameRound(a: Facts, b: Facts): boolean {
  const x = a.round_amount_usd
  const y = b.round_amount_usd
  if (x === null || y === null || Math.abs(x - y) / Math.max(x, y) > 0.05) return false
  if (a.announced_date && b.announced_date) {
    const days = Math.abs(Date.parse(a.announced_date) - Date.parse(b.announced_date)) / 86400_000
    if (days > 7) return false
  }
  return true
}

export type UpsertOutcome = "created" | "merged" | "reopened" | "skipped_previously_rejected" | "skipped_draft_exists"

// Finds the startup for an announcement (domain first, then normalised name) and merges into it.
export async function upsertStartup(
  announcement: ExtractedAnnouncement,
  article: Pick<ArticleRow, "id" | "url" | "isDemo">,
  fx: FxConfig,
  recheckDays: number,
  runId: number | null
): Promise<{ startupId: number; outcome: UpsertOutcome }> {
  const db = getDb()
  const { facts, evidence } = factsFromExtraction(announcement, fx)
  const normalizedName = normalizeCompanyName(facts.company_name)
  const domain = facts.company_domain

  const matches = await db
    .select()
    .from(schema.startups)
    .where(
      domain
        ? or(eq(schema.startups.rootDomain, domain), eq(schema.startups.normalizedName, normalizedName))
        : eq(schema.startups.normalizedName, normalizedName)
    )
  // Prefer the domain match; a name match only counts if the domains don't conflict.
  let existing =
    matches.find((m) => domain && m.rootDomain === domain) ??
    matches.find((m) => !domain || !m.rootDomain || m.rootDomain === domain)

  // Fallback for name variants ("TailBlaze" vs "TailBlaze Longevity"): same first word and
  // the same round (amount within 5%, announced within 7 days) is the same company.
  if (!existing) {
    const firstWord = normalizedName.split(" ")[0]
    if (firstWord.length >= 4) {
      const similar = await db
        .select()
        .from(schema.startups)
        .where(like(schema.startups.normalizedName, `${firstWord}%`))
      existing = similar.find((m) => {
        if (domain && m.rootDomain && m.rootDomain !== domain) return false
        if (m.normalizedName.split(" ")[0] !== firstWord) return false
        return sameRound(m.facts as Facts, facts)
      })
    }
  }

  if (!existing) {
    const [row] = await db
      .insert(schema.startups)
      .values({
        name: facts.company_name,
        rootDomain: domain,
        normalizedName,
        facts,
        evidence,
        announcedOn: facts.announced_date,
        isDemo: article.isDemo,
        stage: "extracted",
        decision: "pending",
      })
      .returning({ id: schema.startups.id })
    await db.insert(schema.startupSources).values({ startupId: row.id, articleId: article.id }).onConflictDoNothing()
    await db.insert(schema.events).values({ startupId: row.id, type: "article_found", detail: { url: article.url } })
    return { startupId: row.id, outcome: "created" }
  }

  const before = existing.facts as Facts
  const merged = mergeFacts(before, facts)
  const mergedEvidence = mergeEvidence(existing.evidence as Evidence, evidence)
  const linked = await db
    .insert(schema.startupSources)
    .values({ startupId: existing.id, articleId: article.id })
    .onConflictDoNothing()
    .returning({ id: schema.startupSources.articleId })
  const [{ n: sourceCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.startupSources)
    .where(eq(schema.startupSources.startupId, existing.id))
  const flags = new Set(existing.flags)
  if (sourceCount > 1) flags.add("multi_source_merged")

  let outcome: UpsertOutcome = "merged"
  let stage = existing.stage
  let decision = existing.decision
  let reasonCodes = existing.reasonCodes
  const changed = hardFactsChanged(before, facts)
  const recentlyRejected =
    existing.decision === "rejected" && Date.now() - existing.updatedAt.getTime() < recheckDays * 86400_000

  if (existing.decision === "rejected") {
    // Re-evaluate a rejected company only when the news changes a hard fact (e.g. a new round)
    // or the cool-off period has passed.
    if (changed || !recentlyRejected) {
      outcome = "reopened"
      stage = "extracted"
      decision = "pending"
      reasonCodes = []
    } else {
      outcome = "skipped_previously_rejected"
    }
  } else if (existing.stage === "drafted" || existing.stage === "synced" || existing.decision === "accepted") {
    outcome = "skipped_draft_exists"
  }

  await db
    .update(schema.startups)
    .set({
      facts: merged,
      evidence: mergedEvidence,
      rootDomain: existing.rootDomain ?? domain,
      announcedOn: merged.announced_date,
      flags: [...flags],
      // A live article makes a demo startup a real one.
      isDemo: existing.isDemo && article.isDemo,
      stage,
      decision,
      reasonCodes,
    })
    .where(eq(schema.startups.id, existing.id))

  if (linked.length > 0) {
    await db.insert(schema.events).values({ startupId: existing.id, type: "article_found", detail: { url: article.url, merged: true } })
  }
  if (outcome === "skipped_previously_rejected" || outcome === "skipped_draft_exists") {
    await db.insert(schema.qualificationLog).values({
      startupId: existing.id,
      companyDomain: existing.rootDomain ?? domain,
      decision: "skipped",
      reasonCodes: [outcome === "skipped_draft_exists" ? "SKIP_DRAFT_EXISTS" : "SKIP_PREVIOUSLY_REJECTED"],
      flags: [...flags],
      sourceUrls: [article.url],
      runId,
    })
  }
  return { startupId: existing.id, outcome }
}

export async function runExtract(runId?: number): Promise<StageResult> {
  const started = Date.now()
  const db = getDb()
  const [cfg, thesis] = await Promise.all([loadQualificationConfig(), loadThesis()])
  const fx: FxConfig = { inr_per_usd: cfg.inr_per_usd, fx_per_usd: cfg.fx_per_usd }
  const counts = { articles: 0, funding: 0, not_funding: 0, announcements: 0, startups_created: 0, startups_merged: 0, reopened: 0, skipped: 0, failed: 0, deferred: 0 }
  const errors: StageResult["errors"] = []

  const pending = await db
    .select()
    .from(schema.articles)
    .where(
      or(
        eq(schema.articles.status, "new"),
        and(eq(schema.articles.status, "error"), lt(schema.articles.attempts, MAX_ATTEMPTS))
      )
    )
    .orderBy(schema.articles.isDemo, schema.articles.publishedAt)

  const batches: ArticleRow[][] = []
  for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE))

  // Gemini calls run in parallel; database merges run one at a time to keep dedupe exact.
  const results = await mapLimit(batches, CONCURRENCY, async (batch) => {
    if (Date.now() - started > TIME_BUDGET_MS) return { batch, deferred: true as const }
    try {
      const inputs: ExtractInput[] = await Promise.all(
        batch.map(async (a, i) => ({
          index: i + 1,
          title: a.title,
          source: a.source,
          publishedAt: a.publishedAt?.toISOString().slice(0, 10) ?? null,
          text: (await ensureText(a)).slice(0, MAX_TEXT_CHARS),
        }))
      )
      const response = await generateJson({
        system: EXTRACT_SYSTEM,
        prompt: buildExtractPrompt(inputs, thesis.excludedSectors),
        responseSchema: extractResponseSchema,
        zod: extractZod,
      })
      return { batch, response }
    } catch (err) {
      return { batch, error: (err as Error).message }
    }
  })

  for (const r of results) {
    if ("deferred" in r) {
      counts.deferred += r.batch.length
      continue
    }
    if ("error" in r) {
      counts.failed += r.batch.length
      errors.push({ item: `batch of ${r.batch.length}`, message: r.error ?? "unknown" })
      await db
        .update(schema.articles)
        .set({ status: "error", error: r.error, attempts: sql`${schema.articles.attempts} + 1` })
        .where(inArray(schema.articles.id, r.batch.map((a) => a.id)))
      continue
    }
    for (const [i, article] of r.batch.entries()) {
      counts.articles++
      const result = r.response.articles.find((x) => x.article_index === i + 1)
      if (!result || !result.is_funding_announcement || result.announcements.length === 0) {
        counts.not_funding++
        await db
          .update(schema.articles)
          .set({ status: "not_funding", extraction: result ?? null, error: result?.not_funding_reason ?? null, attempts: sql`${schema.articles.attempts} + 1` })
          .where(eq(schema.articles.id, article.id))
        continue
      }
      counts.funding++
      for (const announcement of result.announcements) {
        counts.announcements++
        try {
          const { outcome } = await upsertStartup(announcement, article, fx, cfg.rejected_recheck_days, runId ?? null)
          if (outcome === "created") counts.startups_created++
          else if (outcome === "reopened") counts.reopened++
          else if (outcome === "merged") counts.startups_merged++
          else counts.skipped++
        } catch (err) {
          errors.push({ item: announcement.company_name, message: (err as Error).message })
        }
      }
      await db
        .update(schema.articles)
        .set({ status: "extracted", extraction: result, error: null, attempts: sql`${schema.articles.attempts} + 1` })
        .where(eq(schema.articles.id, article.id))
    }
  }

  return { counts, errors }
}
