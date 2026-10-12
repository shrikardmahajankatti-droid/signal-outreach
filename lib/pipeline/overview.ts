import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"

export type StageKey =
  | "trigger" | "ingest" | "extract" | "qualify" | "enrich" | "score-draft" | "sync" | "summary" | "gate" | "send"

export type DrawerItem = { title: string; subtitle?: string; href?: string; status?: string }
export type RunInfo = {
  id: number
  status: string
  trigger: string
  startedAt: string
  finishedAt: string | null
  counts: Record<string, number> | null
  errors: { item?: string; message: string }[] | null
}
export type StageOverview = { key: StageKey; count: number | null; lastRun: RunInfo | null; items: DrawerItem[] }

function startOfTodayIST(): Date {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 3600_000)
  ist.setUTCHours(0, 0, 0, 0)
  return new Date(ist.getTime() - 5.5 * 3600_000)
}

async function lastRun(stage: string): Promise<RunInfo | null> {
  const [r] = await getDb().select().from(schema.runs).where(eq(schema.runs.stage, stage)).orderBy(desc(schema.runs.startedAt)).limit(1)
  if (!r) return null
  return {
    id: r.id,
    status: r.status,
    trigger: r.trigger,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    counts: r.counts as RunInfo["counts"],
    errors: r.errors as RunInfo["errors"],
  }
}

export async function getPipelineOverview(): Promise<StageOverview[]> {
  const db = getDb()
  const today = startOfTodayIST()

  const [[{ n: articlesToday }], recentArticles, ingestRun, extractRun, qualifyRun, [{ n: extractedToday }], extractedItems, [{ n: gateToday }], gateItems] =
    await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(schema.articles).where(gte(schema.articles.createdAt, today)),
      db
        .select({ title: schema.articles.title, url: schema.articles.url, source: schema.articles.source, status: schema.articles.status })
        .from(schema.articles)
        .orderBy(desc(schema.articles.createdAt))
        .limit(25),
      lastRun("ingest"),
      lastRun("extract"),
      lastRun("qualify"),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.articles)
        .where(and(eq(schema.articles.status, "extracted"), gte(schema.articles.updatedAt, today))),
      db
        .select({ title: schema.articles.title, url: schema.articles.url, status: schema.articles.status, error: schema.articles.error })
        .from(schema.articles)
        .where(inArray(schema.articles.status, ["extracted", "not_funding", "error"]))
        .orderBy(desc(schema.articles.updatedAt))
        .limit(25),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.qualificationLog)
        .where(and(eq(schema.qualificationLog.phase, "gate"), gte(schema.qualificationLog.createdAt, today))),
      db
        .select({
          name: schema.startups.name,
          decision: schema.qualificationLog.decision,
          codes: schema.qualificationLog.reasonCodes,
          flags: schema.qualificationLog.flags,
        })
        .from(schema.qualificationLog)
        .innerJoin(schema.startups, eq(schema.startups.id, schema.qualificationLog.startupId))
        .where(eq(schema.qualificationLog.phase, "gate"))
        .orderBy(desc(schema.qualificationLog.createdAt))
        .limit(30),
    ])

  const empty = (key: StageKey): StageOverview => ({ key, count: null, lastRun: null, items: [] })
  return [
    empty("trigger"),
    {
      key: "ingest",
      count: articlesToday,
      lastRun: ingestRun,
      items: recentArticles.map((a) => ({ title: a.title, subtitle: a.source, href: a.url, status: a.status })),
    },
    {
      key: "extract",
      count: extractedToday,
      lastRun: extractRun,
      items: extractedItems.map((a) => ({
        title: a.title,
        subtitle: a.status === "not_funding" ? `not funding${a.error ? `: ${a.error}` : ""}` : a.status === "error" ? `error: ${a.error ?? ""}` : "funding news",
        href: a.url,
      })),
    },
    {
      key: "qualify",
      count: gateToday,
      lastRun: qualifyRun,
      items: gateItems.map((g) => ({
        title: g.name,
        subtitle: [g.decision, ...g.codes].join(" · ") + (g.flags.length ? ` · flags: ${g.flags.join(", ")}` : ""),
      })),
    },
    empty("enrich"),
    empty("score-draft"),
    empty("sync"),
    empty("summary"),
    empty("gate"),
    empty("send"),
  ]
}

export async function getRecentArticles(limit = 50) {
  return getDb()
    .select({
      id: schema.articles.id,
      title: schema.articles.title,
      url: schema.articles.url,
      source: schema.articles.source,
      sourceType: schema.articles.sourceType,
      publishedAt: schema.articles.publishedAt,
      status: schema.articles.status,
      isDemo: schema.articles.isDemo,
    })
    .from(schema.articles)
    .orderBy(desc(schema.articles.publishedAt))
    .limit(limit)
}
