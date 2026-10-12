// Step 8: Resend emails Rohit the morning summary with a button to the Outreach page.
import { and, desc, eq, gte, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { loadQualificationConfig } from "@/lib/config"
import { sendEmail } from "@/lib/email/send"
import { escapeHtml } from "@/lib/hubspot"
import { daysLeftInWindow } from "@/lib/window"
import type { StageResult } from "./runs"

export async function runSummary(): Promise<StageResult> {
  const db = getDb()
  const cfg = await loadQualificationConfig()
  const to = process.env.ROHIT_EMAIL
  if (!to) return { counts: { sent: 0 }, errors: [{ message: "ROHIT_EMAIL not set" }] }

  const pending = await db
    .select({
      id: schema.drafts.id,
      subject: schema.drafts.subject,
      name: schema.startups.name,
      fit: schema.startups.fitScore,
      announcedOn: schema.startups.announcedOn,
      createdAt: schema.startups.createdAt,
      facts: schema.startups.facts,
    })
    .from(schema.drafts)
    .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
    .where(eq(schema.drafts.status, "pending"))
    .orderBy(desc(schema.startups.fitScore))

  const since = new Date(Date.now() - 24 * 3600_000)
  const [[{ articles }], [{ rejected }]] = await Promise.all([
    db.select({ articles: sql<number>`count(*)::int` }).from(schema.articles).where(gte(schema.articles.createdAt, since)),
    db
      .select({ rejected: sql<number>`count(*)::int` })
      .from(schema.qualificationLog)
      .where(and(eq(schema.qualificationLog.decision, "rejected"), gte(schema.qualificationLog.createdAt, since))),
  ])

  const rows = pending.map((p) => ({ ...p, daysLeft: daysLeftInWindow(p.announcedOn, p.createdAt, cfg.late_catch_days) }))
  const closing = rows.filter((r) => r.daysLeft !== null && r.daysLeft <= 7).length
  const headline = `${rows.length} draft${rows.length === 1 ? "" : "s"} ready · ${closing} closing their ${cfg.late_catch_days}-day window`
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "")

  const list = rows
    .slice(0, 10)
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E6E6E9"><strong>${escapeHtml(r.name)}</strong><br><span style="color:#6B6F76">${escapeHtml(r.subject)}</span></td><td style="padding:8px 0;border-bottom:1px solid #E6E6E9;text-align:right;color:#6B6F76;white-space:nowrap">fit ${r.fit ?? "—"} · ${r.daysLeft ?? "?"}d left</td></tr>`
    )
    .join("")
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#1A1A1A;max-width:560px">
<p style="font-size:13px;color:#6B6F76;margin:0 0 4px">Signal · morning summary</p>
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(headline)}</h1>
<p style="font-size:14px;color:#6B6F76;margin:0 0 16px">Last 24h: ${articles} articles read, ${rejected} rejected by the rules. Nothing is sent until you approve it.</p>
${rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${list}</table>` : ""}
<p style="margin:20px 0"><a href="${appUrl}/outreach" style="background:#1A1A1A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Review drafts</a></p>
</div>`
  const text = `${headline}\n\nLast 24h: ${articles} articles read, ${rejected} rejected.\n\n${rows
    .slice(0, 10)
    .map((r) => `- ${r.name} (fit ${r.fit ?? "—"}, ${r.daysLeft ?? "?"}d left): ${r.subject}`)
    .join("\n")}\n\nReview drafts: ${appUrl}/outreach`

  await sendEmail({ to, toName: "Rohit", subject: `Signal: ${headline}`, text, html, kind: "summary" })
  return { counts: { sent: 1, drafts: rows.length, closing }, errors: [] }
}
