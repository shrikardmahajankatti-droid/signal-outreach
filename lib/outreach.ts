// Outreach actions shared by the UI (server actions), crons and the Resend webhook.
// The human gate lives here: nothing is sent except through approveAndSend(), which only
// runs when Rohit clicks Approve.
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { loadEmailRules } from "@/lib/config"
import { sendEmail } from "@/lib/email/send"
import { escapeHtml, hubspotEnabled, logOnTimeline, moveDeal, getDealStage, REPLIED_OR_LATER, syncStartupToHubSpot, type StageKey } from "@/lib/hubspot"
import { normalizeCompanyName, rootDomain } from "@/lib/domain"
import type { Facts } from "@/lib/qualification/facts"
import { unsubscribeUrl } from "@/lib/unsubscribe"
import { validateEmail } from "@/lib/validateEmail"

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i

// Local mirror of the deal stage (the GTM board reads this; HubSpot stays the CRM of record).
export async function setLocalStage(startupId: number, stage: StageKey) {
  await getDb().update(schema.startups).set({ dealStage: stage }).where(eq(schema.startups.id, startupId))
}

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
    await getDb()
      .update(schema.founders)
      .set({ email: toEmail, emailSource: "rohit" })
      .where(and(eq(schema.founders.id, draft.founderId), or(isNull(schema.founders.email), sql`${schema.founders.email} <> ${toEmail}`)))
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
  await db.update(schema.drafts).set({ status: "sent", sentAt, resendId: sent.id, deliveredTo: sent.deliveredTo }).where(eq(schema.drafts.id, draftId))
  await setLocalStage(startup.id, "email_sent")
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
  await getDb().update(schema.startups).set({ stage: "closed", dealStage: "not_pursued" }).where(eq(schema.startups.id, startup.id))
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
  await setLocalStage(startupId, stage)
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
  await setLocalStage(startupId, "not_pursued")
  await event(startupId, reason)
  await crm(startupId, "not_pursued", async () => {
    await moveDeal(startupId, "not_pursued")
    await logOnTimeline(startupId, `<p>Signal: recipient ${reason}. Added to do-not-contact.</p>`)
  })
}

// ─── Follow-ups (step 10) ────────────────────────────────────────────────────
// By default follow-ups are kept in Rohit's hands ("manual"): the cron only surfaces what's due,
// and he edits / regenerates / sends each one. "auto" lets the daily cron send due follow-ups.

export type FollowupsMode = "manual" | "auto"
export async function getFollowupsMode(): Promise<FollowupsMode> {
  const { getSetting } = await import("@/lib/config")
  return (await getSetting<FollowupsMode>("followups_mode")) ?? "manual"
}

async function loadFollowup(followupId: number) {
  const [row] = await getDb()
    .select({ f: schema.followups, d: schema.drafts, s: schema.startups })
    .from(schema.followups)
    .innerJoin(schema.drafts, eq(schema.drafts.id, schema.followups.draftId))
    .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
    .where(eq(schema.followups.id, followupId))
  if (!row) throw new Error("Follow-up not found")
  return row
}

// Why a follow-up must not go out (replied, suppressed, deal moved on), or null if it may.
async function followupBlocker(d: typeof schema.drafts.$inferSelect, s: typeof schema.startups.$inferSelect): Promise<string | null> {
  const db = getDb()
  if (d.status !== "sent") return "The first email hasn't been sent yet"
  if (d.repliedAt) return "They replied"
  const dncConds = [
    s.rootDomain ? eq(schema.doNotContact.rootDomain, s.rootDomain) : undefined,
    d.toEmail ? eq(schema.doNotContact.email, d.toEmail.toLowerCase()) : undefined,
  ].filter(Boolean)
  const [dnc] = dncConds.length ? await db.select({ id: schema.doNotContact.id }).from(schema.doNotContact).where(or(...dncConds)) : []
  if (dnc) return "Recipient is on the do-not-contact list"
  let stage: StageKey | null = (s.dealStage as StageKey | null) ?? null
  if (hubspotEnabled()) stage = (await getDealStage(s.id).catch(() => null)) ?? stage
  if (stage && REPLIED_OR_LATER.includes(stage)) {
    if (stage !== s.dealStage) await setLocalStage(s.id, stage)
    return `Deal is at "${stage.replace("_", " ")}"`
  }
  return null
}

const FU_RULES_WORDS = 110

export async function saveFollowup(followupId: number, edits: { subject: string; body: string }) {
  const { f } = await loadFollowup(followupId)
  if (f.sentAt) throw new Error("Already sent")
  await getDb()
    .update(schema.followups)
    .set({ subject: edits.subject.trim(), body: edits.body, editedAt: new Date(), status: "scheduled" })
    .where(eq(schema.followups.id, followupId))
}

export async function skipFollowup(followupId: number) {
  const { f, s } = await loadFollowup(followupId)
  if (f.sentAt) throw new Error("Already sent")
  await getDb().update(schema.followups).set({ status: "cancelled" }).where(eq(schema.followups.id, followupId))
  await event(s.id, "followup_skipped", { day: f.dayOffset })
}

export async function sendFollowup(followupId: number, edits?: { subject: string; body: string }) {
  const db = getDb()
  const { f, d, s } = await loadFollowup(followupId)
  if (f.sentAt) throw new Error("Already sent")
  const blocker = await followupBlocker(d, s)
  if (blocker) {
    await db.update(schema.followups).set({ status: "cancelled" }).where(and(eq(schema.followups.draftId, d.id), isNull(schema.followups.sentAt)))
    throw new Error(`${blocker}: remaining follow-ups cancelled`)
  }
  const subject = (edits?.subject ?? f.subject).trim()
  const body = edits?.body ?? f.body
  const rules = await loadEmailRules()
  const v = validateEmail({ subject, body }, { ...rules, bodyMaxWords: FU_RULES_WORDS }, { companyName: s.name, openerFacts: [s.name] })
  const blocking = v.checks.filter((c) => !c.pass && c.key !== "opener_specific" && c.key !== "subject_names_company")
  if (blocking.length) throw new Error(`Fix first: ${blocking.map((c) => c.label).join(", ")}`)

  const [founder] = d.founderId ? await db.select().from(schema.founders).where(eq(schema.founders.id, d.founderId)) : []
  const sent = await sendEmail({
    to: d.toEmail,
    toName: founder?.name ?? null,
    subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${d.subject}`,
    text: body,
    unsubscribeUrl: unsubscribeUrl(s.id),
    kind: "followup",
    startupId: s.id,
  })
  await db
    .update(schema.followups)
    .set({ subject, body, status: "sent", sentAt: new Date(), resendId: sent.id, deliveredTo: sent.deliveredTo })
    .where(eq(schema.followups.id, f.id))
  await setLocalStage(s.id, "followup_sent")
  await event(s.id, "followup_sent", { day: f.dayOffset, resendId: sent.id, demo: sent.demo, deliveredTo: sent.deliveredTo })
  await crm(s.id, "followup_sent", async () => {
    await moveDeal(s.id, "followup_sent")
    await logOnTimeline(s.id, `<p><strong>Day ${f.dayOffset} follow-up sent via Signal</strong>${sent.demo ? " (DEMO → test inbox)" : ""}</p><pre>${escapeHtml(body)}</pre>`)
  })
  return sent
}

// Cron: in "auto" mode sends due follow-ups; in "manual" mode only cancels blocked ones and reports what's due.
export async function sendDueFollowups(): Promise<{ due: number; sent: number; cancelled: number; failed: number; mode: FollowupsMode; errors: { item: string; message: string }[] }> {
  const db = getDb()
  const mode = await getFollowupsMode()
  const due = await db
    .select({ f: schema.followups, d: schema.drafts, s: schema.startups })
    .from(schema.followups)
    .innerJoin(schema.drafts, eq(schema.drafts.id, schema.followups.draftId))
    .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
    .where(and(eq(schema.followups.status, "scheduled"), lte(schema.followups.dueAt, new Date()), eq(schema.drafts.status, "sent")))
    .orderBy(asc(schema.followups.dueAt))
  const out = { due: due.length, sent: 0, cancelled: 0, failed: 0, mode, errors: [] as { item: string; message: string }[] }
  for (const { f, d, s } of due) {
    try {
      const blocker = await followupBlocker(d, s)
      if (blocker) {
        await db.update(schema.followups).set({ status: "cancelled" }).where(and(eq(schema.followups.draftId, d.id), isNull(schema.followups.sentAt)))
        out.cancelled++
        continue
      }
      if (mode === "auto") {
        await sendFollowup(f.id)
        out.sent++
      }
    } catch (err) {
      out.failed++
      out.errors.push({ item: `${s.name} day ${f.dayOffset}`, message: (err as Error).message })
    }
  }
  return out
}

// Pulls deal stages from HubSpot for contacted startups (Rohit may move deals there).
export async function refreshStagesFromHubSpot(): Promise<number> {
  if (!hubspotEnabled()) return 0
  const db = getDb()
  const rows = await db
    .select({ id: schema.startups.id, stage: schema.startups.dealStage })
    .from(schema.startups)
    .innerJoin(schema.drafts, eq(schema.drafts.startupId, schema.startups.id))
    .where(and(eq(schema.drafts.status, "sent")))
  let changed = 0
  for (const r of rows) {
    const stage = await getDealStage(r.id).catch(() => null)
    if (stage && stage !== r.stage) {
      await setLocalStage(r.id, stage)
      if (REPLIED_OR_LATER.includes(stage)) {
        const [d] = await db.select({ id: schema.drafts.id }).from(schema.drafts).where(eq(schema.drafts.startupId, r.id))
        if (d) await db.update(schema.followups).set({ status: "cancelled" }).where(and(eq(schema.followups.draftId, d.id), isNull(schema.followups.sentAt)))
      }
      changed++
    }
  }
  return changed
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

// "Generate": Gemini writes a fresh follow-up using everything sent so far (+ an optional angle),
// validated in code with up to 2 rewrites. Saved as an edit; nothing is sent.
export async function generateFollowup(followupId: number, angle?: string) {
  const db = getDb()
  const { f, d, s } = await loadFollowup(followupId)
  if (f.sentAt) throw new Error("Already sent")
  const { getSetting } = await import("@/lib/config")
  const { generateJson } = await import("@/lib/gemini")
  const { buildFollowupPrompt, followupResponseSchema, followupSystem, followupZod } = await import("@/lib/prompts/followup")
  const { renderFooter, withFooter } = await import("@/lib/validateEmail")
  const rules = await loadEmailRules()
  const accelerator = await getSetting<{ name: string }>("accelerator_profile")
  const all = await db.select().from(schema.followups).where(eq(schema.followups.draftId, d.id)).orderBy(asc(schema.followups.dayOffset))
  const [founder] = d.founderId ? await db.select().from(schema.founders).where(eq(schema.founders.id, d.founderId)) : []
  const facts = s.facts as Facts
  const research = s.research as { founder_posts?: { text: string }[] } | null
  const footer = renderFooter(rules.footer, { accelerator_name: accelerator?.name ?? "", unsubscribe_url: unsubscribeUrl(s.id) })
  const system = followupSystem(rules, FU_RULES_WORDS)
  const prompt = buildFollowupPrompt({
    day: f.dayOffset,
    isLast: f.dayOffset === Math.max(...all.map((x) => x.dayOffset)),
    original: { subject: d.subject, body: d.body },
    previous: all.filter((x) => x.sentAt).map((x) => ({ day: x.dayOffset, body: x.body })),
    facts: { company: facts.company_name, round: facts.round_stage_raw ?? facts.round_stage, investors: facts.investors, sector: facts.sector, what_they_do: facts.what_they_do, use_of_funds: facts.use_of_funds },
    founderName: founder?.name ?? null,
    accelerator,
    angle: angle?.trim() || undefined,
    newInfo: (research?.founder_posts ?? []).slice(0, 3).map((p) => p.text.slice(0, 280)),
  })
  let out = await generateJson({ system, prompt, responseSchema: followupResponseSchema, zod: followupZod, temperature: 0.7 })
  const check = (o: typeof out) => {
    const v = validateEmail({ subject: o.subject, body: withFooter(o.body, footer) }, { ...rules, bodyMaxWords: FU_RULES_WORDS }, { companyName: s.name, openerFacts: [s.name] })
    return v.checks.filter((c) => !c.pass && c.key !== "opener_specific" && c.key !== "subject_names_company")
  }
  for (let i = 0; i < 2 && check(out).length; i++) {
    const failures = check(out).map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ""}`)
    out = await generateJson({ system, prompt: `${prompt}

YOUR PREVIOUS ATTEMPT FAILED THESE CHECKS, fix them:
${failures.join("\n")}

${out.body}`, responseSchema: followupResponseSchema, zod: followupZod, temperature: 0.3 })
  }
  const body = withFooter(out.body, footer)
  await db.update(schema.followups).set({ subject: out.subject.trim(), body, editedAt: new Date(), status: "scheduled" }).where(eq(schema.followups.id, followupId))
  await event(s.id, "followup_generated", { day: f.dayOffset, angle: out.angle })
  return { subject: out.subject.trim(), body, angle: out.angle }
}
