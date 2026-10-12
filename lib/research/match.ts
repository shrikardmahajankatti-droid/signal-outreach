// Pure helpers that pick a company website, founder LinkedIn profiles and a size band
// out of search results. Confidence is computed in code, not by the model.
import { rootDomain } from "@/lib/domain"
import type { TavilyResult } from "./tavily"

const NOT_COMPANY_SITES = new Set([
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com", "crunchbase.com", "tracxn.com",
  "inc42.com", "entrackr.com", "yourstory.com", "techcrunch.com", "economictimes.com", "indiatimes.com", "livemint.com",
  "moneycontrol.com", "vccircle.com", "startuptalky.com", "e27.co", "dealstreetasia.com", "dealroom.co", "wikipedia.org",
  "medium.com", "pitchbook.com", "cbinsights.com", "zaubacorp.com", "ambitionbox.com", "glassdoor.com", "glassdoor.co.in",
  "startupresearcher.com", "google.com", "apple.com", "play.google.com", "github.com", "angel.co", "wellfound.com",
  "theprint.in", "business-standard.com", "thehindubusinessline.com", "financialexpress.com", "bloomberg.com", "reuters.com",
  "news.google.com", "msn.com", "yahoo.com", "substack.com", "producthunt.com", "f6s.com", "instamojo.com",
])

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["the", "and", "technologies", "private", "limited", "india"].includes(t))

// The company site is a non-news, non-social result whose domain contains the company's first name token.
export function pickCompanyDomain(companyName: string, results: TavilyResult[]): { domain: string; url: string } | null {
  const nameTokens = tokens(companyName.replace(/\.(ai|io|com|in|co)$/i, ""))
  const key = nameTokens[0]?.replace(/ai$/, "")
  if (!key || key.length < 3) return null
  for (const r of results) {
    const domain = rootDomain(r.url)
    if (!domain || NOT_COMPANY_SITES.has(domain)) continue
    const label = domain.split(".")[0]
    if (label.includes(key) || key.includes(label)) return { domain, url: r.url }
  }
  return null
}

export type LinkedInMatch = { url: string; confidence: number; title: string }

export function matchFounderLinkedIn(
  founder: { name: string; title: string | null },
  companyName: string,
  results: TavilyResult[]
): LinkedInMatch | null {
  const nameTokens = tokens(founder.name)
  const companyTokens = tokens(companyName.replace(/\.(ai|io|com)$/i, ""))
  let best: LinkedInMatch | null = null
  for (const r of results) {
    if (!/linkedin\.com\/in\//i.test(r.url)) continue
    const slug = decodeURIComponent(r.url.split("/in/")[1] ?? "").toLowerCase()
    const hay = `${r.title} ${r.content}`.toLowerCase()
    let score = 0
    const nameHits = nameTokens.filter((t) => slug.includes(t) || r.title.toLowerCase().includes(t)).length
    // The profile must carry the person's name; company + title alone is someone else's profile.
    if (nameHits === 0) continue
    if (nameHits === nameTokens.length) score += 0.5
    else score += 0.25
    if (companyTokens.some((t) => hay.includes(t))) score += 0.35
    if (/founder|ceo|cto|co-founder/.test(hay)) score += 0.15
    if (score >= 0.5 && (!best || score > best.confidence)) {
      best = { url: r.url.split("?")[0], confidence: Math.min(1, Number(score.toFixed(2))), title: r.title }
    }
  }
  return best
}

// "11-50 employees" (LinkedIn company size band) in search snippets.
export function findEmployeeBand(results: TavilyResult[]): { min: number; max: number; source: string } | null {
  for (const r of results) {
    const m = `${r.title} ${r.content}`.match(/\b(\d{1,5})\s*[-–]\s*(\d{1,6})\s+employees\b/i)
    if (m) return { min: Number(m[1]), max: Number(m[2]), source: r.url }
    const plus = `${r.title} ${r.content}`.match(/\b(10,?001)\+\s+employees\b/i)
    if (plus) return { min: 10001, max: 10001, source: r.url }
  }
  return null
}
