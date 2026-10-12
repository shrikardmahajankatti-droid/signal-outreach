import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { verifyResendSignature } from "@/lib/email/webhook"
import { hubspotEnabled, moveDeal } from "@/lib/hubspot"
import { unsubscribe } from "@/lib/outreach"

type ResendEvent = { type: string; created_at: string; data: { email_id: string; to?: string[] } }

// delivered → contacted + HubSpot "Email sent"; bounced / complained → do_not_contact; opened → timeline.
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
      if (draft && !draft.openedAt) await db.update(schema.drafts).set({ openedAt: new Date(evt.created_at) }).where(eq(schema.drafts.id, draft.id))
      break
    case "email.bounced":
    case "email.complained":
      await unsubscribe(startupId, evt.type === "email.bounced" ? "bounced" : "complained", d.toEmail)
      break
  }
  await db.insert(schema.events).values({ startupId, type: evt.type.replace("email.", "email_"), detail: { emailId, followup: Boolean(followup) } })
  return NextResponse.json({ ok: true })
}
