// Look up founder emails with Hunter for pending drafts that still have no recipient.
import "./load-env"
import { and, eq, isNull } from "drizzle-orm"
import { getDb, schema } from "../db"
import { findFounderEmailsWithHunter } from "../lib/research/discover"
import { hunterBudget } from "../lib/research/hunter"

async function main() {
  const rows = await getDb()
    .select({ startupId: schema.drafts.startupId, name: schema.startups.name })
    .from(schema.drafts)
    .innerJoin(schema.startups, eq(schema.startups.id, schema.drafts.startupId))
    .where(and(eq(schema.drafts.status, "pending"), isNull(schema.drafts.toEmail)))
  for (const r of rows) {
    if ((await hunterBudget()).left <= 0) break
    try {
      console.log(r.name.padEnd(22), await findFounderEmailsWithHunter(r.startupId, { maxLookups: 1 }))
    } catch (err) {
      console.log(r.name.padEnd(22), "error:", (err as Error).message)
    }
  }
  console.log("budget", await hunterBudget())
}
main().then(() => process.exit(0))
