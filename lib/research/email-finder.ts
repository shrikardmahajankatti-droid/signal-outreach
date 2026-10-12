// Finds founder emails that are PUBLICLY LISTED (company website pages, search snippets).
// Never guesses or constructs an address: every result carries the URL it was found on.
import { resolveMx } from "node:dns/promises"
import { readWithJina } from "@/lib/http"
import { rootDomain } from "@/lib/domain"
import { tavilySearch } from "./tavily"

export type EmailCandidate = {
  email: string
  source: string // URL where it appears
  kind: "founder" | "generic" | "person"
  founder: string | null // founder name it matched
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const GENERIC = /^(hello|hi|info|contact|team|support|admin|sales|careers|jobs|hr|press|media|partners|founders|help|care|enquiry|enquiries|business|connect|mail)$/i
const IGNORE = /^(noreply|no-reply|donotreply|example|test|privacy|legal|abuse|postmaster|webmaster)$|\.(png|jpg|jpeg|svg|gif|webp)$/i

function nameTokens(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length >= 3)
}

// Classifies an address found in public text. Matching a founder needs their name in the local part.
export function classifyEmail(email: string, domain: string, founders: string[]): Omit<EmailCandidate, "source"> | null {
  const [local, host] = email.toLowerCase().split("@")
  if (!local || !host || IGNORE.test(local) || IGNORE.test(email)) return null
  if (rootDomain(host) !== domain) return null
  if (GENERIC.test(local)) return { email: email.toLowerCase(), kind: "generic", founder: null }
  for (const f of founders) {
    const t = nameTokens(f)
    const [first, ...rest] = t
    const last = rest.at(-1)
    const compact = local.replace(/[^a-z]/g, "")
    if (
      (first && compact === first) ||
      (first && last && (compact.includes(first) && compact.includes(last))) ||
      (first && last && compact === `${first[0]}${last}`) ||
      (first && last && compact === `${first}${last[0]}`)
    ) {
      return { email: email.toLowerCase(), kind: "founder", founder: f }
    }
  }
  return { email: email.toLowerCase(), kind: "person", founder: null }
}

export function extractEmails(text: string, source: string, domain: string, founders: string[]): EmailCandidate[] {
  const out: EmailCandidate[] = []
  for (const m of text.matchAll(EMAIL_RE)) {
    const c = classifyEmail(m[0].replace(/\.$/, ""), domain, founders)
    if (c && !out.some((o) => o.email === c.email)) out.push({ ...c, source })
  }
  return out
}

export async function findPublicEmails(domain: string, founders: string[], opts: { websiteText?: string | null; search?: boolean } = {}) {
  const found: EmailCandidate[] = []
  const add = (list: EmailCandidate[]) => {
    for (const c of list) if (!found.some((f) => f.email === c.email)) found.push(c)
  }
  if (opts.websiteText) add(extractEmails(opts.websiteText, `https://${domain}`, domain, founders))
  // Contact / about / team pages are where startups list addresses.
  const pages = ["contact", "about", "team", "contact-us", "about-us"]
  await Promise.all(
    pages.map(async (p) => {
      try {
        const text = await readWithJina(`https://${domain}/${p}`, 15000)
        add(extractEmails(text, `https://${domain}/${p}`, domain, founders))
      } catch {
        // page doesn't exist
      }
    })
  )
  if (opts.search !== false && process.env.TAVILY_API_KEY) {
    try {
      const results = await tavilySearch(`"@${domain}" ${founders.slice(0, 2).map((f) => `"${f}"`).join(" OR ")} email`, { maxResults: 6 })
      for (const r of results) add(extractEmails(`${r.title} ${r.content}`, r.url, domain, founders))
    } catch {
      // search is best-effort
    }
  }
  const rank = { founder: 0, person: 1, generic: 2 }
  return found.sort((a, b) => rank[a.kind] - rank[b.kind])
}

// Deliverability check: does the domain publish MX records? (No mailbox probing.)
const mxCache = new Map<string, boolean>()
export async function domainAcceptsMail(email: string | null): Promise<boolean | null> {
  const host = email?.split("@")[1]?.toLowerCase()
  if (!host) return null
  if (mxCache.has(host)) return mxCache.get(host)!
  try {
    const mx = await resolveMx(host)
    const ok = mx.length > 0
    mxCache.set(host, ok)
    return ok
  } catch {
    mxCache.set(host, false)
    return false
  }
}
