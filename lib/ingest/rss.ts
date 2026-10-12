import Parser from "rss-parser"
import { fetchWithTimeout } from "@/lib/http"
import type { RawItem } from "./types"

type FeedItem = { "content:encoded"?: string }
const parser = new Parser<Record<string, never>, FeedItem>({ customFields: { item: ["content:encoded"] } })

function htmlToText(html: string | undefined, max: number): string | null {
  if (!html) return null
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
  return text ? text.slice(0, max) : null
}

export async function fetchRss(name: string, url: string): Promise<RawItem[]> {
  const res = await fetchWithTimeout(url, { headers: { accept: "application/rss+xml, application/xml, text/xml" } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const feed = await parser.parseString(await res.text())
  return feed.items
    .filter((i) => i.link && i.title)
    .map((i) => ({
      url: i.link!,
      title: i.title!.trim(),
      source: name,
      sourceType: "rss" as const,
      publishedAt: i.isoDate ? new Date(i.isoDate) : i.pubDate ? new Date(i.pubDate) : null,
      snippet: htmlToText(i.contentSnippet ?? i.content ?? i.summary, 1500),
      // WordPress feeds often carry the full article body, which saves a fetch in extract.
      rawText: htmlToText(i["content:encoded"], 20000),
    }))
}
