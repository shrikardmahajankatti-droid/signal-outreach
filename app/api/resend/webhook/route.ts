import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { verifyResendSignature } from "@/lib/email/webhook"
import { hubspotEnabled, moveDeal } from "@/lib/hubspot"
import { unsubscribe } from "@/lib/outreach"

type ResendEvent = { type: string; created_at: string; data: { email_id: string; to?: string[]; click?: { link?: string } } }

// delivered → contacted + HubSpot "Email sent"; bounced / complained → do_not_contact;
// opened / clicked → tracked on the draft or follow-up and the startup timeline.
export async function POST(req: Request) {
  const body = await req.text()
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET not set" }, { status: 503 })
  if (!verifyResendSignature(body, req.headers, secret)) return NextResponse.json({ error: "bad signature" }, { status: 401 })

  const evt = JSON.parse(body) as ResendEvent
  const db = getDb()
  const emailId = evt.data?.email_id
  if (!emailId) return NextResponse.json({ ok: true, ignored: "no email_id" })

  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.resendId, emailId))
  const [followup] = draft ? [] : await db.select().from(schema.followups).where(eq(schema.followups.resendId, emailId))
  const [parentDraft] = followup ? await db.select().from(schema.drafts).where(eq(schema.drafts.id, followup.draftId)) : []
  const d = draft ?? parentDraft
  if (!d) return NextResponse.json({ ok: true, ignored: "unknown email" })
  const startupId = d.startupId
  const [startup] = await db.select().from(schema.startups).where(eq(schema.startups.id, startupId))

  switch (evt.type) {
    case "email.delivered": {
      if (draft) await db.update(schema.drafts).set({ deliveredAt: new Date(evt.created_at) }).where(eq(schema.drafts.id, draft.id))
      if (startup) {
        await db
          .insert(schema.contacted)
          .values({ startupId, rootDomain: startup.rootDomain, normalizedName: startup.normalizedName, email: d.toEmail })
          .onConflictDoNothing()
        if (draft && hubspotEnabled()) await moveDeal(startupId, "email_sent").catch(() => undefined)
      }
      break
    }
    case "email.opened":
    case "email.clicked": {
      const at = new Date(evt.created_at)
      const field = evt.type === "email.opened" ? "openedAt" : "clickedAt"
      if (draft && !draft[field]) await db.update(schema.drafts).set({ [field]: at }).where(eq(schema.drafts.id, draft.id))
      if (followup && !followup[field]) await db.update(schema.followups).set({ [field]: at }).where(eq(schema.followups.id, followup.id))
      // A click also implies an open (images may be blocked).
      if (evt.type === "email.clicked") {
        if (draft && !draft.openedAt) await db.update(schema.drafts).set({ openedAt: at }).where(eq(schema.drafts.id, draft.id))
        if (followup && !followup.openedAt) await db.update(schema.followups).set({ openedAt: at }).where(eq(schema.followups.id, followup.id))
      }
      break
    }
    case "email.bounced":
    case "email.complained":
      await unsubscribe(startupId, evt.type === "email.bounced" ? "bounced" : "complained", d.toEmail)
      break
  }
  // One timeline row per email per event type (opens can fire many times).
  const type = evt.type.replace("email.", "email_")
  const seen = (draft ?? followup) && (evt.type === "email.opened" || evt.type === "email.clicked")
    ? (evt.type === "email.opened" ? (draft?.openedAt ?? followup?.openedAt) : (draft?.clickedAt ?? followup?.clickedAt))
    : null
  if (!seen) {
    await db.insert(schema.events).values({
      startupId,
      type,
      detail: { emailId, followup: followup ? followup.dayOffset : null, link: evt.data.click?.link ?? null, to: evt.data.to ?? null },
    })
  }
  return NextResponse.json({ ok: true })
}
