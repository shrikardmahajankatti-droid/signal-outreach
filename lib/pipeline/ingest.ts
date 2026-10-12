import { eq, inArray } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { loadQualificationConfig } from "@/lib/config"
import { titleHash, urlHash } from "@/lib/domain"
import { fetchRss } from "@/lib/ingest/rss"
import { fetchGNews, fetchNewsData } from "@/lib/ingest/news-apis"
import { snapshotPortfolio } from "@/lib/ingest/portfolio"
import { SourceSkipped, type RawItem } from "@/lib/ingest/types"
import type { StageResult } from "./runs"

// Cheap pre-filter so Gemini only sees articles that might be about raising money.
// G1 (is it a funding announcement?) is still decided by extraction.
const FUNDING_HINT =
  /\b(raises?|raised|raising|funding|secures?|secured|bags?|bagged|nets?|seed|pre-seed|angel|pre-series|series [a-f]|round|crore|million|backed|invest(s|ed|ment)?)\b/i

export function looksLikeFunding(item: Pick<RawItem, "title" | "snippet">): boolean {
  return FUNDING_HINT.test(item.title) || FUNDING_HINT.test(item.snippet ?? "")
}

type Snapshot = { companies: string[]; fetchedAt: string }

export async function runIngest(): Promise<StageResult> {
  const db = getDb()
  const cfg = await loadQualificationConfig()
  const errors: StageResult["errors"] = []
  const counts = { fetched: 0, funding_like: 0, too_old: 0, duplicates: 0, inserted: 0, sources_ok: 0, sources_skipped: 0, sources_failed: 0, portfolio_new: 0 }

  // 1. News sources (RSS + APIs), in parallel.
  const sources = await db.select().from(schema.sources).where(eq(schema.sources.active, true))
  // GNews' free tier rejects concurrent requests, so its queries are spaced 3 s apart.
  let gnewsSlot = 0
  const results = await Promise.allSettled(
    sources.map(async (s) => {
      if (s.type === "rss") return fetchRss(s.name, s.url)
      if (s.type === "gnews") {
        await new Promise((r) => setTimeout(r, 3000 * gnewsSlot++))
        return fetchGNews(s.name, s.url, cfg.fresh_window_hours)
      }
      if (s.type === "newsdata") return fetchNewsData(s.name, s.url)
      return Promise.reject(new Error(`Unknown source type ${s.type}`))
    })
  )

  const items: RawItem[] = []
  for (const [i, r] of results.entries()) {
    const source = sources[i]
    if (r.status === "fulfilled") {
      counts.sources_ok++
      items.push(...r.value)
      await db.update(schema.sources).set({ lastFetchedAt: new Date(), lastError: null }).where(eq(schema.sources.id, source.id))
    } else if (r.reason instanceof SourceSkipped) {
      counts.sources_skipped++
      await db.update(schema.sources).set({ lastError: `skipped: ${r.reason.message}` }).where(eq(schema.sources.id, source.id))
    } else {
      counts.sources_failed++
      const message = (r.reason as Error).message
      errors.push({ item: source.name, message })
      await db.update(schema.sources).set({ lastError: message }).where(eq(schema.sources.id, source.id))
    }
  }

  // 2. Investor portfolio diffs: new companies since the last snapshot become items.
  const investors = await db.select().from(schema.investors).where(eq(schema.investors.active, true))
  const snapshots = await Promise.allSettled(investors.map((inv) => snapshotPortfolio(inv.portfolioUrl)))
  for (const [i, r] of snapshots.entries()) {
    const inv = investors[i]
    if (r.status === "rejected") {
      const message = (r.reason as Error).message
      errors.push({ item: inv.name, message })
      await db.update(schema.investors).set({ lastCheckedAt: new Date(), lastError: message }).where(eq(schema.investors.id, inv.id))
      continue
    }
    const companies = r.value
    const previous = (inv.lastSnapshot as Snapshot | null)?.companies
    // First snapshot is a baseline; an empty scrape is treated as a failed read, not "everything removed".
    if (previous && companies.length > 0) {
      const known = new Set(previous)
      for (const id of companies.filter((c) => !known.has(c))) {
        counts.portfolio_new++
        const url = `https://${id}`
        items.push({
          url,
          title: `${inv.name} portfolio adds ${id}`,
          source: `${inv.name} portfolio`,
          sourceType: "portfolio",
          publishedAt: new Date(),
          snippet: `New company on ${inv.name}'s portfolio page (${inv.portfolioUrl}): ${id}`,
        })
      }
    }
    if (companies.length > 0) {
      await db
        .update(schema.investors)
        .set({ lastSnapshot: { companies, fetchedAt: new Date().toISOString() }, lastCheckedAt: new Date(), lastError: null })
        .where(eq(schema.investors.id, inv.id))
    }
  }

  // 3. Filter, dedupe (URL hash + syndicated-title hash), insert.
  counts.fetched = items.length
  const cutoff = Date.now() - cfg.late_catch_days * 86400_000
  const candidates = new Map<string, RawItem & { urlHash: string; titleHash: string }>()
  const seenTitles = new Set<string>()
  for (const item of items) {
    if (item.sourceType !== "portfolio" && !looksLikeFunding(item)) continue
    counts.funding_like++
    if (item.publishedAt && item.publishedAt.getTime() < cutoff) {
      counts.too_old++
      continue
    }
    const uh = urlHash(item.url)
    const th = titleHash(item.title)
    if (candidates.has(uh) || seenTitles.has(th)) {
      counts.duplicates++
      continue
    }
    seenTitles.add(th)
    candidates.set(uh, { ...item, urlHash: uh, titleHash: th })
  }

  const list = [...candidates.values()]
  if (list.length > 0) {
    const existing = await db
      .select({ urlHash: schema.articles.urlHash, titleHash: schema.articles.titleHash })
      .from(schema.articles)
      .where(inArray(schema.articles.urlHash, list.map((c) => c.urlHash)))
    const existingTitles = await db
      .select({ titleHash: schema.articles.titleHash })
      .from(schema.articles)
      .where(inArray(schema.articles.titleHash, list.map((c) => c.titleHash)))
    const knownUrls = new Set(existing.map((e) => e.urlHash))
    const knownTitles = new Set(existingTitles.map((e) => e.titleHash))
    const fresh = list.filter((c) => !knownUrls.has(c.urlHash) && !knownTitles.has(c.titleHash))
    counts.duplicates += list.length - fresh.length

    for (let i = 0; i < fresh.length; i += 50) {
      const chunk = fresh.slice(i, i + 50)
      const inserted = await db
        .insert(schema.articles)
        .values(
          chunk.map((c) => ({
            url: c.url,
            urlHash: c.urlHash,
            titleHash: c.titleHash,
            title: c.title.slice(0, 500),
            source: c.source,
            sourceType: c.sourceType,
            publishedAt: c.publishedAt && !Number.isNaN(c.publishedAt.getTime()) ? c.publishedAt : null,
            snippet: c.snippet,
            rawText: c.rawText ?? null,
          }))
        )
        .onConflictDoNothing({ target: schema.articles.urlHash })
        .returning({ id: schema.articles.id })
      counts.inserted += inserted.length
    }
  }

  return { counts, errors }
}
