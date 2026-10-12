import { eq, inArray } from "drizzle-orm"
import { getDb, schema } from "@/db"

// Removes demo articles and the startups that only demo articles created.
// Startups that live news also mentioned are kept (they are real leads).
export async function resetDemo(): Promise<{ articles: number; startups: number }> {
  const db = getDb()
  const demoStartups = await db.select({ id: schema.startups.id }).from(schema.startups).where(eq(schema.startups.isDemo, true))
  const startupIds = demoStartups.map((s) => s.id)
  if (startupIds.length) await db.delete(schema.startups).where(inArray(schema.startups.id, startupIds))
  const deleted = await db.delete(schema.articles).where(eq(schema.articles.isDemo, true)).returning({ id: schema.articles.id })
  return { articles: deleted.length, startups: startupIds.length }
}
