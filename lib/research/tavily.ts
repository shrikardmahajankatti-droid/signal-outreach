import { fetchWithTimeout } from "@/lib/http"

export type TavilyResult = { title: string; url: string; content: string; score: number }

// One "basic" search = 1 Tavily credit. Research keeps to about 3 per startup.
export async function tavilySearch(
  query: string,
  opts: { maxResults?: number; includeDomains?: string[]; excludeDomains?: string[]; topic?: "general" | "news" } = {}
): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_KEY
  if (!key) throw new Error("TAVILY_API_KEY not set")
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    timeoutMs: 20000,
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: opts.maxResults ?? 5,
      include_domains: opts.includeDomains,
      exclude_domains: opts.excludeDomains,
      topic: opts.topic ?? "general",
    }),
  })
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = (await res.json()) as { results?: TavilyResult[] }
  return data.results ?? []
}
