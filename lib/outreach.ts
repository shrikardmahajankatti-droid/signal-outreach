// Outreach actions shared by the UI (server actions), crons and the Resend webhook.
// The human gate lives here: nothing is sent except through approveAndSend(), which only
// runs when Rohit clicks Approve.
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { loadEmailRules } from "@/lib/config"
import { sendEmail } from "@/lib/email/send"
import { escapeHtml, hubspotEnabled, logOnTimeline, moveDeal, getDealStage, REPLIED_OR_LATER, syncStartupToHubSpot, type StageKey } from "@/lib/hubspot"
import { normalizeCompanyName, rootDomain } from "@/lib/domain"
import type { Facts } from "@/lib/qualification/facts"
import { unsubscribeUrl } from "@/lib/unsubscribe"
import { validateEmail } from "@/lib/validateEmail"

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i

async function event(startupId: number, type: string, detail?: Record<string, unknown>) {
  await getDb().insert(schema.events).values({ startupId, type, detail: detail ?? null })
}

// CRM calls never block outreach; failures are recorded on the timeline instead.
async function crm(startupId: number, what: string, fn: () => Promise<unknown>) {
  if (!hubspotEnabled()) return
  try {
    await fn()
  } catch (err) {
    await event(startupId, "hubspot_error", { what, message: (err as Error).message.slice(0, 300) })
  }
}

async function loadDraft(draftId: number) {
  const db = getDb()
  const [row] = await db
    .select({ draft: schema.drafts, startup: schema.startups })
    .from(schema.drafts)
    .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
    .where(eq(schema.drafts.id, draftId))
  if (!row) throw new Error("Draft not found")
  return row
}

function openerFacts(facts: Facts, openerFact?: string) {
  return [
    ...facts.founders.map((f) => f.name.split(" ")[0]),
    ...facts.investors.map((i) => i.replace(/\(.*?\)/g, "").trim()),
    ...(facts.what_they_do ? [facts.what_they_do] : []),
    ...(openerFact ? [openerFact] : []),
  ]
}

export type DraftEdits = { subject: string; body: string; toEmail: string | null }

export async function saveDraft(draftId: number, edits: DraftEdits) {
  const { draft, startup } = await loadDraft(draftId)
  if (draft.status === "sent") throw new Error("This email was already sent")
  const rules = await loadEmailRules()
  const facts = startup.facts as Facts
  const v = validateEmail(edits, rules, { companyName: startup.name, openerFacts: openerFacts(facts, (draft.checks as { openerFact?: string } | null)?.openerFact) })
  const toEmail = edits.toEmail?.trim() || null
  if (toEmail && !EMAIL_RE.test(toEmail)) throw new Error("That email address doesn't look valid")
  await getDb()
    .update(schema.drafts)
    .set({
      subject: edits.subject.trim(),
      body: edits.body,
      toEmail,
      checks: { ...((draft.checks as object) ?? {}), pass: v.pass, wordCount: v.wordCount, items: v.checks, editedByRohit: true },
    })
    .where(eq(schema.drafts.id, draftId))
  if (toEmail && draft.founderId) {
    await getDb().update(schema.founders).set({ email: toEmail }).where(eq(schema.founders.id, draft.founderId))
  }
  return v
}

export async function approveAndSend(draftId: number, edits: DraftEdits) {
  const db = getDb()
  const { draft, startup } = await loadDraft(draftId)
  if (draft.status === "sent") throw new Error("Already sent: Signal never emails the same startup twice")

  const v = await saveDraft(draftId, edits)
  if (!v.pass) {
    const failed = v.checks.filter((c) => !c.pass).map((c) => c.label)
    throw new Error(`Fix the checklist first: ${failed.join(", ")}`)
  }

  // No duplicate outreach: contacted / do-not-contact are checked again at send time.
  const toEmail = edits.toEmail?.trim() || null
  const domain = startup.rootDomain
  const emailDomain = toEmail ? rootDomain(toEmail.split("@")[1]) : null
  const [contacted] = await db
    .select({ id: schema.contacted.id })
    .from(schema.contacted)
    .where(
      or(
        domain ? eq(schema.contacted.rootDomain, domain) : undefined,
        and(isNull(schema.contacted.rootDomain), eq(schema.contacted.normalizedName, startup.normalizedName))
      )
    )
  if (contacted) throw new Error("This company is already in the contacted list")
  const dncConds = [
    domain ? eq(schema.doNotContact.rootDomain, domain) : undefined,
    emailDomain ? eq(schema.doNotContact.rootDomain, emailDomain) : undefined,
    toEmail ? eq(schema.doNotContact.email, toEmail.toLowerCase()) : undefined,
  ].filter(Boolean)
  if (dncConds.length) {
    const [dnc] = await db.select({ id: schema.doNotContact.id }).from(schema.doNotContact).where(or(...dncConds))
    if (dnc) throw new Error("This recipient is on the do-not-contact list")
  }

  const [founder] = draft.founderId ? await db.select().from(schema.founders).where(eq(schema.founders.id, draft.founderId)) : []
  await db.update(schema.drafts).set({ status: "approved", approvedAt: new Date() }).where(eq(schema.drafts.id, draftId))
  await event(startup.id, "approved")

  const sent = await sendEmail({
    to: toEmail,
    toName: founder?.name ?? null,
    subject: edits.subject.trim(),
    text: edits.body,
    unsubscribeUrl: unsubscribeUrl(startup.id),
    kind: "outreach",
    startupId: startup.id,
  })

  const sentAt = new Date()
  await db.update(schema.drafts).set({ status: "sent", sentAt, resendId: sent.id }).where(eq(schema.drafts.id, draftId))
  await db
    .insert(schema.contacted)
    .values({ startupId: startup.id, rootDomain: domain, normalizedName: startup.normalizedName || normalizeCompanyName(startup.name), email: toEmail })
    .onConflictDoNothing()
  const fus = await db.select().from(schema.followups).where(eq(schema.followups.draftId, draftId))
  for (const f of fus) {
    await db
      .update(schema.followups)
      .set({ dueAt: new Date(sentAt.getTime() + f.dayOffset * 86400_000), status: "scheduled" })
      .where(eq(schema.followups.id, f.id))
  }
  await db.update(schema.startups).set({ stage: "sent" }).where(eq(schema.startups.id, startup.id))
  await event(startup.id, "sent", { resendId: sent.id, deliveredTo: sent.deliveredTo, demo: sent.demo })

  await crm(startup.id, "email_sent", async () => {
    if (!startup.hubspotDealId) await syncStartupToHubSpot(startup.id)
    await moveDeal(startup.id, "email_sent")
    await logOnTimeline(
      startup.id,
      `<p><strong>Email sent via Signal</strong>${sent.demo ? " (DEMO → test inbox)" : ""}</p><p><strong>${escapeHtml(edits.subject)}</strong></p><pre>${escapeHtml(edits.body)}</pre>`
    )
  })
  return { ...sent, validation: v }
}

export async function skipDraft(draftId: number, reason: string) {
  const { draft, startup } = await loadDraft(draftId)
  if (draft.status === "sent") throw new Error("Already sent")
  await getDb().update(schema.drafts).set({ status: "skipped", skipReason: reason || "Skipped" }).where(eq(schema.drafts.id, draftId))
  await getDb().update(schema.followups).set({ status: "cancelled" }).where(eq(schema.followups.draftId, draftId))
  await getDb().update(schema.startups).set({ stage: "closed" }).where(eq(schema.startups.id, startup.id))
  await event(startup.id, "skipped", { reason })
  await crm(startup.id, "not_pursued", async () => {
    await moveDeal(startup.id, "not_pursued")
    await logOnTimeline(startup.id, `<p>Skipped in Signal: ${escapeHtml(reason || "no reason given")}</p>`)
  })
}

export async function setDealStage(startupId: number, stage: StageKey) {
  const db = getDb()
  if (stage === "replied") {
    await db.update(schema.drafts).set({ repliedAt: new Date() }).where(eq(schema.drafts.startupId, startupId))
  }
  if (REPLIED_OR_LATER.includes(stage)) {
    const drafts = await db.select({ id: schema.drafts.id }).from(schema.drafts).where(eq(schema.drafts.startupId, startupId))
    if (drafts.length) {
      await db
        .update(schema.followups)
        .set({ status: "cancelled" })
        .where(and(inArray(schema.followups.draftId, drafts.map((d) => d.id)), eq(schema.followups.status, "scheduled")))
    }
  }
  await event(startupId, `stage_${stage}`)
  await crm(startupId, stage, () => moveDeal(startupId, stage))
}

export async function unsubscribe(startupId: number, reason: "unsubscribed" | "bounced" | "complained" = "unsubscribed", email?: string | null) {
  const db = getDb()
  const [s] = await db.select().from(schema.startups).where(eq(schema.startups.id, startupId))
  if (!s) return
  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.startupId, startupId))
  const address = (email ?? draft?.toEmail ?? null)?.toLowerCase() ?? null
  await db.insert(schema.doNotContact).values({ rootDomain: s.rootDomain, email: address, reason, note: s.name })
  if (draft) {
    await db
      .update(schema.followups)
      .set({ status: "cancelled" })
      .where(and(eq(schema.followups.draftId, draft.id), eq(schema.followups.status, "scheduled")))
  }
  await event(startupId, reason)
  await crm(startupId, "not_pursued", async () => {
    await moveDeal(startupId, "not_pursued")
    await logOnTimeline(startupId, `<p>Signal: recipient ${reason}. Added to do-not-contact.</p>`)
  })
}

// Step 10 (follow-ups): sends day 3/7/14 follow-ups that are due, unless the deal reached Replied or later.
export async function sendDueFollowups(): Promise<{ sent: number; cancelled: number; failed: number; errors: { item: string; message: string }[] }> {
  const db = getDb()
  const due = await db
    .select({ f: schema.followups, d: schema.drafts, s: schema.startups })
    .from(schema.followups)
    .innerJoin(schema.drafts, eq(schema.drafts.id, schema.followups.draftId))
    .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
    .where(and(eq(schema.followups.status, "scheduled"), lte(schema.followups.dueAt, new Date()), eq(schema.drafts.status, "sent")))
    .orderBy(asc(schema.followups.dueAt))
  const out = { sent: 0, cancelled: 0, failed: 0, errors: [] as { item: string; message: string }[] }
  for (const { f, d, s } of due) {
    try {
      let stage: StageKey | null = null
      if (hubspotEnabled()) stage = await getDealStage(s.id).catch(() => null)
      const dncConds = [
        s.rootDomain ? eq(schema.doNotContact.rootDomain, s.rootDomain) : undefined,
        d.toEmail ? eq(schema.doNotContact.email, d.toEmail.toLowerCase()) : undefined,
      ].filter(Boolean)
      const [dnc] = dncConds.length
        ? await db.select({ id: schema.doNotContact.id }).from(schema.doNotContact).where(or(...dncConds))
        : []
      if (d.repliedAt || dnc || (stage && REPLIED_OR_LATER.includes(stage))) {
        await db.update(schema.followups).set({ status: "cancelled" }).where(eq(schema.followups.draftId, d.id))
        out.cancelled++
        continue
      }
      const [founder] = d.founderId ? await db.select().from(schema.founders).where(eq(schema.founders.id, d.founderId)) : []
      const subject = f.subject.toLowerCase().startsWith("re:") ? f.subject : `Re: ${d.subject}`
      const sent = await sendEmail({
        to: d.toEmail,
        toName: founder?.name ?? null,
        subject,
        text: f.body,
        unsubscribeUrl: unsubscribeUrl(s.id),
        kind: "followup",
        startupId: s.id,
      })
      await db.update(schema.followups).set({ status: "sent", sentAt: new Date(), resendId: sent.id }).where(eq(schema.followups.id, f.id))
      await event(s.id, "followup_sent", { day: f.dayOffset, resendId: sent.id, demo: sent.demo })
      await crm(s.id, "followup_sent", async () => {
        await moveDeal(s.id, "followup_sent")
        await logOnTimeline(s.id, `<p><strong>Day ${f.dayOffset} follow-up sent via Signal</strong></p><pre>${escapeHtml(f.body)}</pre>`)
      })
      out.sent++
    } catch (err) {
      out.failed++
      out.errors.push({ item: `${s.name} day ${f.dayOffset}`, message: (err as Error).message })
    }
  }
  return out
}

// Step 7: drafted startups not yet in HubSpot → Company + Contact + Deal at "Draft ready".
export async function syncPendingToHubSpot(limit = 20): Promise<{ synced: number; errors: { item: string; message: string }[] }> {
  if (!hubspotEnabled()) return { synced: 0, errors: [] }
  const db = getDb()
  const rows = await db
    .select({ id: schema.startups.id, name: schema.startups.name })
    .from(schema.startups)
    .innerJoin(schema.drafts, eq(schema.drafts.startupId, schema.startups.id))
    .where(and(isNull(schema.startups.hubspotDealId), eq(schema.drafts.status, "pending")))
    .limit(limit)
  const out = { synced: 0, errors: [] as { item: string; message: string }[] }
  for (const r of rows) {
    try {
      await syncStartupToHubSpot(r.id)
      await logOnTimeline(r.id, `<p>Signal drafted an outreach email. Review it in Signal before anything is sent.</p>`)
      await event(r.id, "hubspot_synced")
      out.synced++
    } catch (err) {
      out.errors.push({ item: r.name, message: (err as Error).message })
    }
  }
  return out
}
