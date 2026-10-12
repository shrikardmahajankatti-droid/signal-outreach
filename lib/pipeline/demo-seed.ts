import { getDb, schema } from "@/db"
import { buildDemoArticles, demoReferenceDate } from "@/lib/demo"
import { titleHash, urlHash } from "@/lib/domain"

// Inserts the demo articles (is_demo) so the next pipeline run processes them like live news.
export async function insertDemoArticles(): Promise<{ inserted: number; total: number }> {
  const db = getDb()
  const ref = demoReferenceDate()
  await db
    .insert(schema.appSettings)
    .values({ key: "demo_reference_date", value: ref })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: ref } })
  const articles = buildDemoArticles()
  const inserted = await db
    .insert(schema.articles)
    .values(
      articles.map((a) => ({
        url: a.url,
        urlHash: urlHash(a.url),
        titleHash: titleHash(a.title),
        title: a.title,
        source: a.source,
        sourceType: "demo",
        publishedAt: a.publishedAt,
        rawText: a.rawText,
        snippet: a.rawText.slice(0, 300),
        isDemo: true,
      }))
    )
    .onConflictDoNothing({ target: schema.articles.urlHash })
    .returning({ id: schema.articles.id })
  return { inserted: inserted.length, total: articles.length }
}
