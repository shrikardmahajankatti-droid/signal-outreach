import { fetchWithTimeout } from "@/lib/http"
import { SourceSkipped, type RawItem } from "./types"

type GNewsArticle = { title: string; description?: string; content?: string; url: string; publishedAt?: string; source?: { name?: string } }

export async function fetchGNews(name: string, query: string, sinceHours: number): Promise<RawItem[]> {
  const key = process.env.GNEWS_API_KEY
  if (!key) throw new SourceSkipped("GNEWS_API_KEY not set")
  const from = new Date(Date.now() - sinceHours * 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z")
  const params = new URLSearchParams({ q: query, lang: "en", max: "25", from, sortby: "publishedAt", apikey: key })
  const res = await fetchWithTimeout(`https://gnews.io/api/v4/search?${params}`)
  if (!res.ok) throw new Error(`GNews HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = (await res.json()) as { articles?: GNewsArticle[] }
  return (data.articles ?? []).map((a) => ({
    url: a.url,
    title: a.title,
    source: a.source?.name ? `${name} · ${a.source.name}` : name,
    sourceType: "gnews" as const,
    publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
    snippet: [a.description, a.content].filter(Boolean).join(" ").slice(0, 1500) || null,
  }))
}

type NewsDataArticle = { title: string; link: string; description?: string; content?: string; pubDate?: string; source_id?: string }

export async function fetchNewsData(name: string, query: string): Promise<RawItem[]> {
  const key = process.env.NEWSDATA_API_KEY
  if (!key) throw new SourceSkipped("NEWSDATA_API_KEY not set")
  const params = new URLSearchParams({ apikey: key, q: query, language: "en", category: "business,technology" })
  const res = await fetchWithTimeout(`https://newsdata.io/api/1/latest?${params}`)
  if (!res.ok) throw new Error(`NewsData HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = (await res.json()) as { results?: NewsDataArticle[] }
  return (data.results ?? []).map((a) => ({
    url: a.link,
    title: a.title,
    source: a.source_id ? `${name} · ${a.source_id}` : name,
    sourceType: "newsdata" as const,
    // NewsData returns "YYYY-MM-DD HH:MM:SS" in UTC.
    publishedAt: a.pubDate ? new Date(a.pubDate.replace(" ", "T") + "Z") : null,
    snippet: a.description?.slice(0, 1500) ?? null,
    rawText: a.content && !a.content.startsWith("ONLY AVAILABLE") ? a.content.slice(0, 20000) : null,
  }))
}
