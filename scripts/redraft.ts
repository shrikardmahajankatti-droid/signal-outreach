// Regenerate pending drafts: `npm run redraft -- <startupId>` or `-- all`.
import "./load-env"
import { eq } from "drizzle-orm"
import { getDb, schema } from "../db"
import { redraftStartup } from "../lib/pipeline/score-draft"

async function main() {
  const arg = process.argv[2]
  const ids =
    arg === "all"
      ? (await getDb().select({ id: schema.drafts.startupId }).from(schema.drafts).where(eq(schema.drafts.status, "pending"))).map((r) => r.id)
      : [Number(arg)]
  for (const id of ids) console.log(id, await redraftStartup(id))
}
main().then(() => process.exit(0))
