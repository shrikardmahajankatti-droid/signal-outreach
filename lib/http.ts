export const USER_AGENT = "Mozilla/5.0 (compatible; SignalBot/1.0; +https://signal-outreach-seven.vercel.app)"

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 15000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, ...(rest.headers ?? {}) },
    })
  } finally {
    clearTimeout(timer)
  }
}

// Jina Reader returns a page as clean markdown. Works without a key (rate-limited).
export async function readWithJina(url: string, timeoutMs = 30000): Promise<string> {
  const headers: Record<string, string> = { accept: "text/plain", "x-return-format": "markdown" }
  if (process.env.JINA_API_KEY) headers.authorization = `Bearer ${process.env.JINA_API_KEY}`
  const res = await fetchWithTimeout(`https://r.jina.ai/${url}`, { headers, timeoutMs })
  if (!res.ok) throw new Error(`Jina ${res.status} for ${url}`)
  return res.text()
}
