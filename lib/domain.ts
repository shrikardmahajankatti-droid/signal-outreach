// URL and company-name normalisation shared by ingest, dedupe and the qualification gates.
import { createHash } from "node:crypto"

const MULTI_PART_TLDS = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in",
  "co.uk", "org.uk", "com.au", "com.sg", "com.my", "co.id", "com.br", "co.jp", "com.cn", "co.za", "com.mx",
])

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref$|ref_src|ocid|cmpid|guccounter)/i

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    u.hash = ""
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "")
    for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key)
    u.pathname = u.pathname.replace(/\/+$/, "") || "/"
    return u.toString()
  } catch {
    return raw.trim()
  }
}

export function urlHash(raw: string): string {
  return sha256(canonicalUrl(raw))
}

// "https://www.app.acme.co.in/about" → "acme.co.in"; bare "acme.ai" works too.
export function rootDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let host = input.trim().toLowerCase()
  if (!host) return null
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname
  } catch {
    return null
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "")
  const parts = host.split(".")
  if (parts.length < 2 || parts.some((p) => !p)) return null
  const lastTwo = parts.slice(-2).join(".")
  const keep = MULTI_PART_TLDS.has(lastTwo) ? 3 : 2
  return parts.slice(-keep).join(".")
}

const COMPANY_SUFFIXES =
  /\b(private limited|pvt\.? ltd\.?|pvt|ltd\.?|limited|inc\.?|llc|llp|corp\.?|corporation|technologies|technology|tech|labs|ai|hq|app|india)\b/g

// "Desible.ai" → "desible", "CurvetAI Technologies Pvt Ltd" → "curvet".
export function normalizeCompanyName(name: string): string {
  let n = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  n = n.replace(/\.(ai|io|com|in|co|app|xyz|tech)\b/g, " ")
  n = n.replace(/([a-z])ai\b/g, "$1") // CurvetAI → curvet
  n = n.replace(COMPANY_SUFFIXES, " ")
  n = n.replace(/[^a-z0-9]+/g, " ").trim()
  return n || name.toLowerCase().trim()
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, "") // strip " - Publisher" suffix used by Google News
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function titleHash(title: string): string {
  return sha256(normalizeTitle(title))
}
