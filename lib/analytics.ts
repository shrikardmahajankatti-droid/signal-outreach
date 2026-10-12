import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"

const IST = "Asia/Kolkata"
function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}
export function lastNDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(Date.now() - i * 86400_000)))
  return out
}
function bucket(dates: (Date | null)[], days: string[]): number[] {
  const counts = new Map(days.map((d) => [d, 0]))
  for (const d of dates) {
    if (!d) continue
    const k = dayKey(d)
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1)
  }
  return days.map((d) => counts.get(d)!)
}

export async function outreachPerDay(n = 30) {
  const db = getDb()
  const since = new Date(Date.now() - n * 86400_000)
  const days = lastNDays(n)
  const [drafts, sent] = await Promise.all([
    db.select({ at: schema.drafts.createdAt }).from(schema.drafts).where(gte(schema.drafts.createdAt, since)),
    db.select({ at: schema.drafts.sentAt }).from(schema.drafts).where(and(isNotNull(schema.drafts.sentAt), gte(schema.drafts.sentAt, since))),
  ])
  const d = bucket(drafts.map((x) => x.at), days)
  const s = bucket(sent.map((x) => x.at), days)
  return days.map((day, i) => ({ day: day.slice(5), drafted: d[i], sent: s[i] }))
}

export async function funnel() {
  const db = getDb()
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0
  const n = sql<number>`count(*)::int`
  const [articles, funding, gated, drafted, sent, replied] = await Promise.all([
    count(db.select({ n }).from(schema.articles)),
    count(db.select({ n }).from(schema.articles).where(eq(schema.articles.status, "extracted"))),
    count(db.select({ n: sql<number>`count(distinct ${schema.qualificationLog.startupId})::int` }).from(schema.qualificationLog).where(and(eq(schema.qualificationLog.phase, "gate"), eq(schema.qualificationLog.decision, "accepted")))),
    count(db.select({ n }).from(schema.drafts)),
    count(db.select({ n }).from(schema.drafts).where(eq(schema.drafts.status, "sent"))),
    count(db.select({ n }).from(schema.drafts).where(isNotNull(schema.drafts.repliedAt))),
  ])
  return [
    { stage: "Articles", value: articles },
    { stage: "Funding news", value: funding },
    { stage: "Passed gates", value: gated },
    { stage: "Drafted", value: drafted },
    { stage: "Sent", value: sent },
    { stage: "Replied", value: replied },
  ]
}

export async function replyRateByOpener() {
  const rows = await getDb()
    .select({
      opener: schema.drafts.openerSource,
      sent: sql<number>`count(*) filter (where ${schema.drafts.status} = 'sent')::int`,
      replied: sql<number>`count(*) filter (where ${schema.drafts.repliedAt} is not null)::int`,
      drafted: sql<number>`count(*)::int`,
    })
    .from(schema.drafts)
    .groupBy(schema.drafts.openerSource)
  return rows.map((r) => ({ ...r, opener: r.opener ?? "unknown", rate: r.sent ? Math.round((r.replied / r.sent) * 100) : 0 }))
}

export async function topRejectionReasons(limit = 8) {
  const rows = await getDb().execute(
    sql`select code, count(*)::int as n from ${schema.startups}, unnest(${schema.startups.reasonCodes}) as code where ${schema.startups.decision} in ('rejected','skipped') group by code order by n desc limit ${limit}`
  )
  return (rows.rows as { code: string; n: number }[]).map((r) => ({ code: r.code, n: Number(r.n) }))
}

export async function homeKpis() {
  const db = getDb()
  const days = lastNDays(14)
  const since14 = new Date(Date.now() - 14 * 86400_000)
  const since7 = new Date(Date.now() - 7 * 86400_000)
  const [pendingRows, sentRows, draftsRecent] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.drafts).where(eq(schema.drafts.status, "pending")),
    db
      .select({ sentAt: schema.drafts.sentAt, repliedAt: schema.drafts.repliedAt, announcedOn: schema.startups.announcedOn, createdAt: schema.startups.createdAt })
      .from(schema.drafts)
      .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
      .where(isNotNull(schema.drafts.sentAt)),
    db.select({ at: schema.drafts.createdAt }).from(schema.drafts).where(gte(schema.drafts.createdAt, since14)),
  ])
  const sentThisWeek = sentRows.filter((r) => r.sentAt! >= since7).length
  const replied = sentRows.filter((r) => r.repliedAt).length
  const hours = sentRows.map((r) => {
    const start = r.announcedOn ? new Date(`${r.announcedOn}T00:00:00Z`) : r.createdAt
    return (r.sentAt!.getTime() - start.getTime()) / 3600_000
  })
  const avgHours = hours.length ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length) : null
  return {
    draftsReady: pendingRows[0]?.n ?? 0,
    sentThisWeek,
    replyRate: sentRows.length ? Math.round((replied / sentRows.length) * 100) : null,
    avgHours,
    sparkDrafts: bucket(draftsRecent.map((d) => d.at), days),
    sparkSent: bucket(sentRows.map((r) => r.sentAt), days),
    sparkReplies: bucket(sentRows.map((r) => r.repliedAt), days),
  }
}

export async function todaysRun() {
  const db = getDb()
  const ist = new Date(Date.now() + 5.5 * 3600_000)
  ist.setUTCHours(0, 0, 0, 0)
  const today = new Date(ist.getTime() - 5.5 * 3600_000)
  const n = sql<number>`count(*)::int`
  const [[a], [f], [r], [d], [last]] = await Promise.all([
    db.select({ n }).from(schema.articles).where(gte(schema.articles.createdAt, today)),
    db.select({ n }).from(schema.articles).where(and(eq(schema.articles.status, "extracted"), gte(schema.articles.updatedAt, today))),
    db.select({ n }).from(schema.qualificationLog).where(and(eq(schema.qualificationLog.decision, "rejected"), gte(schema.qualificationLog.createdAt, today))),
    db.select({ n }).from(schema.drafts).where(gte(schema.drafts.createdAt, today)),
    db.select({ startedAt: schema.runs.startedAt }).from(schema.runs).orderBy(desc(schema.runs.startedAt)).limit(1),
  ])
  return { articles: a.n, funding: f.n, rejected: r.n, drafts: d.n, lastRunAt: last?.startedAt ?? null }
}

export async function recentActivity(limit = 12) {
  return getDb()
    .select({ id: schema.events.id, type: schema.events.type, createdAt: schema.events.createdAt, name: schema.startups.name, startupId: schema.startups.id, detail: schema.events.detail })
    .from(schema.events)
    .innerJoin(schema.startups, eq(schema.startups.id, schema.events.startupId))
    .orderBy(desc(schema.events.createdAt))
    .limit(limit)
}
