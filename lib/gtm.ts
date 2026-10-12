// GTM view of outreach: every drafted startup placed in one sales column, plus the follow-up queue.
import { asc, eq, inArray } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { loadQualificationConfig } from "@/lib/config"
import { getFollowupsMode, type FollowupsMode } from "@/lib/outreach"
import type { Facts } from "@/lib/qualification/facts"
import { daysLeftInWindow } from "@/lib/window"

import { type ColumnKey } from "./gtm-columns"
export { COLUMNS, type ColumnKey } from "./gtm-columns"

// Days of silence after the last touch before a finished sequence counts as "no response".
const NO_RESPONSE_AFTER_DAYS = 3

export type DealCard = {
  startupId: number
  draftId: number
  company: string
  founder: string | null
  email: string | null
  fit: number | null
  round: string | null
  column: ColumnKey
  dealStage: string | null
  daysLeft: number | null
  sentAt: string | null
  lastTouchAt: string | null
  touches: number
  opened: boolean
  clicked: boolean
  nextFollowup: { id: number; day: number; dueAt: string | null } | null
}

export type QueueItem = {
  id: number
  startupId: number
  draftId: number
  company: string
  founder: string | null
  email: string | null
  day: number
  subject: string
  body: string
  dueAt: string | null
  edited: boolean
  originalSubject: string
  sentCount: number
}

export async function getGtmBoard(now = new Date()): Promise<{
  cards: DealCard[]
  queue: QueueItem[]
  metrics: Record<string, number | null>
  mode: FollowupsMode
}> {
  const db = getDb()
  const [rows, cfg, mode] = await Promise.all([
    db
      .select({ d: schema.drafts, s: schema.startups, founderName: schema.founders.name })
      .from(schema.drafts)
      .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
      .leftJoin(schema.founders, eq(schema.founders.id, schema.drafts.founderId)),
    loadQualificationConfig(),
    getFollowupsMode(),
  ])
  const draftIds = rows.map((r) => r.d.id)
  const fus = draftIds.length
    ? await db.select().from(schema.followups).where(inArray(schema.followups.draftId, draftIds)).orderBy(asc(schema.followups.dayOffset))
    : []

  const cards: DealCard[] = []
  const queue: QueueItem[] = []
  for (const { d, s, founderName } of rows) {
    const mine = fus.filter((f) => f.draftId === d.id)
    const sentFus = mine.filter((f) => f.sentAt)
    const pendingFus = mine.filter((f) => !f.sentAt && f.status === "scheduled")
    const touches = (d.sentAt ? 1 : 0) + sentFus.length
    const lastTouch = [d.sentAt, ...sentFus.map((f) => f.sentAt)].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null
    const next = pendingFus.find((f) => f.dueAt) ?? null
    const stage = s.dealStage

    let column: ColumnKey
    if (d.status === "skipped" || stage === "not_pursued") column = "closed"
    else if (stage === "applied") column = "applied"
    else if (d.repliedAt || stage === "replied" || stage === "meeting_booked") column = "in_talks"
    else if (d.status !== "sent") column = "ready"
    else if (next?.dueAt && next.dueAt <= now) column = "followup_due"
    else if (next) column = "awaiting"
    else if (lastTouch && now.getTime() - lastTouch.getTime() < NO_RESPONSE_AFTER_DAYS * 86400_000) column = "awaiting"
    else column = "no_response"

    const facts = s.facts as Facts
    cards.push({
      startupId: s.id,
      draftId: d.id,
      company: s.name,
      founder: founderName,
      email: d.toEmail,
      fit: s.fitScore,
      round: facts.round_stage_raw ?? facts.round_stage,
      column,
      dealStage: stage,
      daysLeft: daysLeftInWindow(s.announcedOn, s.createdAt, cfg.late_catch_days, now),
      sentAt: d.sentAt?.toISOString() ?? null,
      lastTouchAt: lastTouch?.toISOString() ?? null,
      touches,
      opened: Boolean(d.openedAt || sentFus.some((f) => f.openedAt)),
      clicked: Boolean(d.clickedAt || sentFus.some((f) => f.clickedAt)),
      nextFollowup: next ? { id: next.id, day: next.dayOffset, dueAt: next.dueAt?.toISOString() ?? null } : null,
    })

    // Only live sequences belong in the follow-up queue.
    if (d.status === "sent" && (column === "followup_due" || column === "awaiting")) {
      for (const f of pendingFus) {
        queue.push({
          id: f.id,
          startupId: s.id,
          draftId: d.id,
          company: s.name,
          founder: founderName,
          email: d.toEmail,
          day: f.dayOffset,
          subject: f.subject,
          body: f.body,
          dueAt: f.dueAt?.toISOString() ?? null,
          edited: Boolean(f.editedAt),
          originalSubject: d.subject,
          sentCount: sentFus.length,
        })
      }
    }
  }
  queue.sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"))

  const count = (k: ColumnKey) => cards.filter((c) => c.column === k).length
  const contacted = cards.filter((c) => c.sentAt).length
  const opened = cards.filter((c) => c.sentAt && c.opened).length
  const responded = count("in_talks") + count("applied")
  const metrics = {
    chosen: cards.length,
    contacted,
    openRate: contacted ? Math.round((opened / contacted) * 100) : null,
    inTalks: count("in_talks"),
    noResponse: count("no_response"),
    responseRate: contacted ? Math.round((responded / contacted) * 100) : null,
    applied: count("applied"),
    followupsDue: queue.filter((q) => q.dueAt && new Date(q.dueAt) <= now).length,
  }
  return { cards, queue, metrics, mode }
}
