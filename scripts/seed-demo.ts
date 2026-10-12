// Loads data/demo_startups.json as is_demo articles and runs them through the real pipeline.
//   npm run seed:demo            insert demo articles + run extract → qualify (→ later stages once built)
//   npm run seed:demo -- --reset delete demo data first
import "./load-env"
import { inArray } from "drizzle-orm"
import { getDb, schema } from "../db"
import { DEMO_ITEMS } from "../lib/demo"
import { insertDemoArticles } from "../lib/pipeline/demo-seed"
import { normalizeCompanyName } from "../lib/domain"
import { PIPELINE_ORDER, runStage } from "../lib/pipeline/stages"
import { resetDemo } from "../lib/pipeline/demo-reset"

async function main() {
  const db = getDb()
  if (process.argv.includes("--reset")) console.log("reset:", await resetDemo())

  const { inserted, total } = await insertDemoArticles()
  console.log(`demo articles: ${inserted} inserted (${total} total)`)

  // Steps 3+ of the real pipeline (ingest is skipped: the demo articles are already in).
  for (const stage of PIPELINE_ORDER.filter((s) => s !== "ingest")) {
    const r = await runStage(stage, "demo")
    console.log(`${stage}: ${r.status}`, JSON.stringify(r.counts))
    for (const e of r.errors) console.log(`  ! ${e.item ?? ""} ${e.message}`)
  }

  // Compare with the expected decisions in the demo file.
  const names = DEMO_ITEMS.map((i) => normalizeCompanyName(i.company_name))
  const rows = await db.select().from(schema.startups).where(inArray(schema.startups.normalizedName, names))
  console.log("\ncompany              decision   stage       reason codes / flags            expected")
  for (const item of DEMO_ITEMS) {
    const row = rows.find((r) => r.normalizedName === normalizeCompanyName(item.company_name))
    const exp = `${item.expected.decision}${item.expected.reason_codes ? ` ${item.expected.reason_codes.join(",")}` : ""}`
    console.log(
      `${item.company_name.padEnd(20)} ${(row?.decision ?? "missing").padEnd(10)} ${(row?.stage ?? "").padEnd(11)} ${[...(row?.reasonCodes ?? []), ...(row?.flags ?? [])].join(",").slice(0, 60).padEnd(32)} ${exp}`
    )
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
