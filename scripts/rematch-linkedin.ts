// Re-runs founder ↔ LinkedIn matching against the search results already stored in
// startups.research (no new Tavily calls). Use after changing lib/research/match.ts.
import "./load-env"
import { eq } from "drizzle-orm"
import { getDb, schema } from "../db"
import { matchFounderLinkedIn } from "../lib/research/match"
import type { Research } from "../lib/pipeline/enrich"

async function main() {
  const db = getDb()
  const rows = await db.select().from(schema.startups)
  let changed = 0
  for (const s of rows) {
    const research = s.research as Research | null
    const search = research?.searches.find((q) => q.query.includes("founder LinkedIn"))
    if (!search) continue
    const results = search.results.map((r) => ({ title: r.title, url: r.url, content: r.snippet, score: 0 }))
    const founders = await db.select().from(schema.founders).where(eq(schema.founders.startupId, s.id))
    for (const f of founders) {
      if (f.linkedinVerified) continue
      const m = matchFounderLinkedIn({ name: f.name, title: f.title }, s.name, results)
      if ((m?.url ?? null) !== f.linkedinUrl || (m?.confidence ?? null) !== f.linkedinMatchConfidence) {
        changed++
        await db
          .update(schema.founders)
          .set({ linkedinUrl: m?.url ?? null, linkedinMatchConfidence: m?.confidence ?? null })
          .where(eq(schema.founders.id, f.id))
      }
    }
  }
  console.log(`founder LinkedIn matches updated: ${changed}`)
}

main().then(() => process.exit(0))
