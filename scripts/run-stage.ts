// Run pipeline stages locally: `npm run stage -- ingest` or `npm run stage -- all`.
import "./load-env"
import { PIPELINE_ORDER, runStage } from "../lib/pipeline/stages"

async function main() {
  const arg = process.argv[2] ?? "all"
  const stages = arg === "all" ? [...PIPELINE_ORDER] : arg.split(",")
  for (const stage of stages) {
    const t = Date.now()
    const r = await runStage(stage, "manual")
    console.log(`${stage}: ${r.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`, JSON.stringify(r.counts))
    for (const e of r.errors) console.log(`  ! ${e.item ?? ""} ${e.message}`)
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
