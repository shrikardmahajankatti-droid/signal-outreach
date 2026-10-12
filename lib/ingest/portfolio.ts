import { readWithJina } from "@/lib/http"
import { rootDomain } from "@/lib/domain"

const IGNORED_DOMAINS = new Set([
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com", "youtu.be",
  "medium.com", "apple.com", "google.com", "github.com", "crunchbase.com", "tracxn.com", "wikipedia.org",
  "amazonaws.com", "cloudfront.net", "jina.ai", "wordpress.com", "vimeo.com", "t.co", "bit.ly", "substack.com",
])

// Pulls company identifiers out of a portfolio page: external company domains, or
// single-segment slugs on the investor's own site (e.g. blume.vc/atomicwork).
export function extractPortfolioCompanies(markdown: string, portfolioUrl: string): string[] {
  const investorRoot = rootDomain(portfolioUrl)
  const portfolioPath = new URL(portfolioUrl).pathname.replace(/\/+$/, "")
  const found = new Set<string>()
  for (const m of markdown.matchAll(/\]\((https?:\/\/[^)\s"]+)/g)) {
    let u: URL
    try {
      u = new URL(m[1])
    } catch {
      continue
    }
    if (/\.(png|jpe?g|svg|gif|webp|pdf)$/i.test(u.pathname)) continue
    const root = rootDomain(u.hostname)
    if (!root || IGNORED_DOMAINS.has(root)) continue
    if (root !== investorRoot) {
      found.add(root)
      continue
    }
    const path = u.pathname.replace(/\/+$/, "")
    const segments = path.split("/").filter(Boolean)
    if (path !== portfolioPath && segments.length === 1 && /^[a-z0-9-]{2,40}$/.test(segments[0]) && !NAV_SLUGS.has(segments[0])) {
      found.add(`${root}/${segments[0]}`)
    }
  }
  return [...found].sort()
}

const NAV_SLUGS = new Set([
  "about", "team", "portfolio", "companies", "contact", "blog", "news", "careers", "jobs", "privacy", "terms",
  "founders", "investors", "media", "press", "events", "faq", "apply", "login", "signup", "insights", "podcast",
  "people", "home", "programs", "resources", "thesis", "funds", "startups", "partners", "community", "imager",
])

export async function snapshotPortfolio(portfolioUrl: string): Promise<string[]> {
  const md = await readWithJina(portfolioUrl, 45000)
  return extractPortfolioCompanies(md, portfolioUrl)
}
