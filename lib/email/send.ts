// All outgoing email goes through here. In DEMO_MODE every message is redirected to the
// test inbox with a banner naming the real recipient, so demo data never reaches founders.
import { Resend } from "resend"
import { getDemoMode, getTestInbox } from "@/lib/env"

let _resend: Resend | null = null
function resend(): Resend {
  if (_resend) return _resend
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set")
  _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export type OutgoingEmail = {
  to: string | null
  toName: string | null
  subject: string
  text: string
  unsubscribeUrl?: string
  kind: "outreach" | "followup" | "summary"
  startupId?: number
  html?: string
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// A plain-looking HTML twin of the text body. Opens can only be tracked in HTML (pixel), and
// clicks only on HTML links, so every email carries both parts.
export function textToHtml(text: string): string {
  const linked = esc(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#2F6FEB">${url}</a>`)
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("")
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1A1A1A;max-width:600px">${paragraphs}</div>`
}

export type SendResult = { id: string; deliveredTo: string; demo: boolean }

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const from = process.env.OUTREACH_FROM
  if (!from) throw new Error("OUTREACH_FROM not set")
  const demo = await getDemoMode()
  let deliveredTo = email.to
  let text = email.text

  if (email.kind !== "summary") {
    if (demo) {
      const inbox = await getTestInbox()
      if (!inbox) throw new Error("DEMO_MODE is on but TEST_INBOX is not set")
      const real = email.to ? `${email.toName ?? ""} <${email.to}>`.trim() : `${email.toName ?? "founder"} (email needed)`
      text = `[DEMO → would go to: ${real}]\n\n${text}`
      deliveredTo = inbox
    } else if (!email.to) {
      throw new Error("Recipient email is required when DEMO_MODE is off")
    }
  }
  if (!deliveredTo) throw new Error("No recipient")

  const headers: Record<string, string> = {}
  if (email.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${email.unsubscribeUrl.replace("/unsubscribe/", "/api/unsubscribe/")}>`
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
  }
  const { data, error } = await resend().emails.send({
    from,
    to: [deliveredTo],
    replyTo: process.env.ROHIT_EMAIL || undefined,
    subject: email.subject,
    text,
    html: email.html ?? textToHtml(text),
    headers,
    tags: [
      { name: "kind", value: email.kind },
      ...(email.startupId ? [{ name: "startup_id", value: String(email.startupId) }] : []),
      { name: "demo", value: demo ? "true" : "false" },
    ],
  })
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "no response"}`)
  return { id: data.id, deliveredTo, demo }
}
