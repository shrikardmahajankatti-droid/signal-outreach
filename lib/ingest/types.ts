export type RawItem = {
  url: string
  title: string
  source: string
  sourceType: "rss" | "gnews" | "newsdata" | "portfolio" | "demo"
  publishedAt: Date | null
  snippet: string | null
  rawText?: string | null
}

// Thrown when a source can't run because it isn't configured (e.g. missing API key): not a failure.
export class SourceSkipped extends Error {}
