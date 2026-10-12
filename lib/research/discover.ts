import { and, eq, isNull } from "drizzle-orm"
import { getDb, schema } from "@/db"
import type { Research } from "@/lib/pipeline/enrich"
import { findPublicEmails, type EmailCandidate } from "./email-finder"

// Runs the public email finder for one startup, stores candidates in research.emails,
// saves founder-matched addresses on the founder, and pre-fills the pending draft's To
// only when the address belongs to the founder that draft greets.
export async function discoverEmails(startupId: number, opts: { search?: boolean } = {}): Promise<EmailCandidate[]> {
  const db = getDb()
  const [s] = await db.select().from(schema.startups).where(eq(schema.startups.id, startupId))
  if (!s?.rootDomain) return []
  const founders = await db.select().from(schema.founders).where(eq(schema.founders.startupId, startupId))
  const research = (s.research as Research | null) ?? null
  const candidates = await findPublicEmails(
    s.rootDomain,
    founders.map((f) => f.name),
    { websiteText: research?.website?.excerpt ?? null, search: opts.search }
  )
  await db
    .update(schema.startups)
    .set({ research: { ...(research ?? {}), emails: candidates, emails_checked_at: new Date().toISOString() } })
    .where(eq(schema.startups.id, startupId))

  for (const c of candidates.filter((c) => c.kind === "founder")) {
    const f = founders.find((x) => x.name === c.founder)
    // Never overwrite an address Rohit typed in.
    if (f && (!f.email || f.emailSource !== "rohit")) {
      await db.update(schema.founders).set({ email: c.email, emailSource: c.source }).where(eq(schema.founders.id, f.id))
      await db
        .update(schema.drafts)
        .set({ toEmail: c.email })
        .where(and(eq(schema.drafts.startupId, startupId), eq(schema.drafts.founderId, f.id), eq(schema.drafts.status, "pending"), isNull(schema.drafts.toEmail)))
    }
  }
  if (candidates.length) {
    await db.insert(schema.events).values({ startupId, type: "emails_found", detail: { count: candidates.length, founder: candidates.filter((c) => c.kind === "founder").length } })
  }
  return candidates
}

// Hunter.io lookup for a drafted startup's founders. Tries the draft's recipient first and stops at
// the first deliverable address, so a startup costs 1–2 credits. Never overwrites Rohit's own input.
export async function findFounderEmailsWithHunter(startupId: number, opts: { maxLookups?: number; onlyFounderId?: number } = {}) {
  const { hunterEnabled, hunterFindEmail } = await import("./hunter")
  if (!hunterEnabled()) return { looked: 0, found: 0 }
  const db = getDb()
  const [s] = await db.select().from(schema.startups).where(eq(schema.startups.id, startupId))
  if (!s) return { looked: 0, found: 0 }
  const founders = await db.select().from(schema.founders).where(eq(schema.founders.startupId, startupId))
  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.startupId, startupId))
  const order = [
    ...founders.filter((f) => f.id === (opts.onlyFounderId ?? draft?.founderId)),
    ...(opts.onlyFounderId ? [] : founders.filter((f) => f.id !== draft?.founderId)),
  ].filter((f) => f.emailSource !== "rohit" && f.emailSource !== "hunter" && f.name.trim().split(/\s+/).length >= 2)

  let looked = 0
  let found = 0
  for (const f of order.slice(0, opts.maxLookups ?? 2)) {
    const [first, ...rest] = f.name.replace(/^(dr|prof)\.?\s+/i, "").trim().split(/\s+/)
    looked++
    const r = await hunterFindEmail({ firstName: first, lastName: rest.join(" "), domain: s.rootDomain, company: s.rootDomain ? null : s.name })
    await db.insert(schema.events).values({ startupId, type: "hunter_lookup", detail: { founder: f.name, email: r.email, score: r.score, status: r.status } })
    if (!r.email) continue
    found++
    await db
      .update(schema.founders)
      .set({ email: r.email, emailSource: "hunter", emailConfidence: r.score, emailStatus: r.status })
      .where(eq(schema.founders.id, f.id))
    // Only a deliverable address is put straight into the draft; anything else stays a suggestion.
    if (draft && draft.status === "pending" && !draft.toEmail && f.id === draft.founderId && (r.status === "valid" || r.status === "accept_all")) {
      await db.update(schema.drafts).set({ toEmail: r.email }).where(eq(schema.drafts.id, draft.id))
    }
    if (r.status === "valid") break
  }
  return { looked, found }
}
