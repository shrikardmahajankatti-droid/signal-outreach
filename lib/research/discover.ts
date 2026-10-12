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
