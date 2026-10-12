// Backfill: look for publicly listed founder emails for startups that already have drafts.
import "./load-env"
import { eq, isNotNull, and } from "drizzle-orm"
import { getDb, schema } from "../db"
import { discoverEmails } from "../lib/research/discover"

async function main() {
  const rows = await getDb()
    .select({ id: schema.startups.id, name: schema.startups.name })
    .from(schema.startups)
    .innerJoin(schema.drafts, eq(schema.drafts.startupId, schema.startups.id))
    .where(and(isNotNull(schema.startups.rootDomain)))
  for (const r of rows) {
    const found = await discoverEmails(r.id)
    console.log(r.name.padEnd(22), found.map((f) => `${f.email} (${f.kind}${f.founder ? `: ${f.founder}` : ""})`).join(", ") || "none listed publicly")
  }
}
main().then(() => process.exit(0))
