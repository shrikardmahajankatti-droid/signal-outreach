import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getSetting, loadEmailRules, loadQualificationConfig } from "@/lib/config"
import { hubspotDealUrl, type HubSpotAccount } from "@/lib/hubspot"
import type { Facts } from "@/lib/qualification/facts"
import { daysLeftInWindow } from "@/lib/window"
import { domainAcceptsMail, type EmailCandidate } from "@/lib/research/email-finder"

export const OUTREACH_TABS = {
  drafts: "pending",
  approved: "approved",
  sent: "sent",
  skipped: "skipped",
} as const
export type OutreachTab = keyof typeof OUTREACH_TABS

export type OutreachRow = {
  draftId: number
  startupId: number
  company: string
  round: string
  amountUsd: number | null
  fitScore: number | null
  daysLeft: number | null
  status: string
  openerSource: string | null
  checksPass: boolean
  hasEmail: boolean
  toName: string | null
  toEmail: string | null
  deliveredTo: string | null
  openedAt: string | null
  clickedAt: string | null
  updatedAt: string
  flags: string[]
}

export async function listOutreach(tab: OutreachTab): Promise<{ rows: OutreachRow[]; counts: Record<OutreachTab, number> }> {
  const db = getDb()
  const cfg = await loadQualificationConfig()
  const [rows, countRows] = await Promise.all([
    db
      .select({ d: schema.drafts, s: schema.startups, founderName: schema.founders.name })
      .from(schema.drafts)
      .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
      .leftJoin(schema.founders, eq(schema.founders.id, schema.drafts.founderId))
      .where(eq(schema.drafts.status, OUTREACH_TABS[tab]))
      .orderBy(desc(schema.startups.fitScore), desc(schema.drafts.updatedAt)),
    db.select({ status: schema.drafts.status, n: sql<number>`count(*)::int` }).from(schema.drafts).groupBy(schema.drafts.status),
  ])
  const counts = Object.fromEntries(
    (Object.keys(OUTREACH_TABS) as OutreachTab[]).map((t) => [t, countRows.find((c) => c.status === OUTREACH_TABS[t])?.n ?? 0])
  ) as Record<OutreachTab, number>
  return {
    counts,
    rows: rows.map(({ d, s, founderName }) => {
      const f = s.facts as Facts
      return {
        draftId: d.id,
        startupId: s.id,
        company: s.name,
        round: f.round_stage_raw ?? f.round_stage ?? "—",
        amountUsd: f.round_amount_usd,
        fitScore: s.fitScore,
        daysLeft: daysLeftInWindow(s.announcedOn, s.createdAt, cfg.late_catch_days),
        status: d.status,
        openerSource: d.openerSource,
        checksPass: Boolean((d.checks as { pass?: boolean } | null)?.pass),
        hasEmail: Boolean(d.toEmail),
        toName: founderName,
        toEmail: d.toEmail,
        deliveredTo: d.deliveredTo,
        openedAt: d.openedAt?.toISOString() ?? null,
        clickedAt: d.clickedAt?.toISOString() ?? null,
        updatedAt: d.updatedAt.toISOString(),
        flags: s.flags,
      }
    }),
  }
}

export async function getDraftDetail(draftId: number) {
  const db = getDb()
  const [row] = await db
    .select({ d: schema.drafts, s: schema.startups })
    .from(schema.drafts)
    .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
    .where(eq(schema.drafts.id, draftId))
  if (!row) return null
  const { d, s } = row
  const [rules, founders, followups, account, cfg] = await Promise.all([
    loadEmailRules(),
    db.select().from(schema.founders).where(eq(schema.founders.startupId, s.id)),
    db.select().from(schema.followups).where(eq(schema.followups.draftId, d.id)).orderBy(schema.followups.dayOffset),
    getSetting<HubSpotAccount>("hubspot_account"),
    loadQualificationConfig(),
  ])
  const facts = s.facts as Facts
  const founder = founders.find((f) => f.id === d.founderId) ?? founders[0] ?? null
  const checks = d.checks as { openerFact?: string; history?: unknown[] } | null
  return {
    draft: {
      id: d.id,
      subject: d.subject,
      body: d.body,
      toEmail: d.toEmail,
      status: d.status,
      openerSource: d.openerSource,
      openerFact: checks?.openerFact ?? null,
      rewriteAttempts: d.rewriteAttempts,
      skipReason: d.skipReason,
      sentAt: d.sentAt?.toISOString() ?? null,
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
      openedAt: d.openedAt?.toISOString() ?? null,
      clickedAt: d.clickedAt?.toISOString() ?? null,
      repliedAt: d.repliedAt?.toISOString() ?? null,
      deliveredTo: d.deliveredTo,
      toEmailAcceptsMail: await domainAcceptsMail(d.toEmail),
    },
    startup: {
      id: s.id,
      name: s.name,
      domain: s.rootDomain,
      fitScore: s.fitScore,
      fitReasons: s.fitReasons,
      flags: s.flags,
      round: facts.round_stage_raw ?? facts.round_stage,
      amountUsd: facts.round_amount_usd,
      investors: facts.investors,
      daysLeft: daysLeftInWindow(s.announcedOn, s.createdAt, cfg.late_catch_days),
      hubspotUrl: hubspotDealUrl(s.hubspotDealId, account),
    },
    founder: founder
      ? { name: founder.name, title: founder.title, linkedinUrl: founder.linkedinUrl, confidence: founder.linkedinMatchConfidence, email: founder.email, emailSource: founder.emailSource }
      : null,
    otherFounders: founders.filter((f) => f.id !== founder?.id).map((f) => ({ name: f.name, email: f.email, emailSource: f.emailSource })),
    emailCandidates: ((s.research as { emails?: EmailCandidate[] } | null)?.emails ?? []) as EmailCandidate[],
    emailsCheckedAt: (s.research as { emails_checked_at?: string } | null)?.emails_checked_at ?? null,
    followups: followups.map((f) => ({
      id: f.id,
      day: f.dayOffset,
      subject: f.subject,
      body: f.body,
      status: f.status,
      dueAt: f.dueAt?.toISOString() ?? null,
      sentAt: f.sentAt?.toISOString() ?? null,
      openedAt: f.openedAt?.toISOString() ?? null,
      deliveredTo: f.deliveredTo,
    })),
    rules: { subjectMaxChars: rules.subjectMaxChars, bodyMaxWords: rules.bodyMaxWords, bannedPhrases: rules.bannedPhrases, spamWords: rules.spamWords, footer: rules.footer },
    openerFacts: [
      ...facts.founders.map((f) => f.name.split(" ")[0]),
      ...facts.investors.map((i) => i.replace(/\(.*?\)/g, "").trim()),
      ...(facts.what_they_do ? [facts.what_they_do] : []),
      ...(checks?.openerFact ? [checks.openerFact] : []),
    ],
  }
}
export type DraftDetail = NonNullable<Awaited<ReturnType<typeof getDraftDetail>>>

export async function draftIdsByStatus(ids: number[], status: string) {
  return getDb()
    .select({ id: schema.drafts.id })
    .from(schema.drafts)
    .where(and(inArray(schema.drafts.id, ids), eq(schema.drafts.status, status)))
}
