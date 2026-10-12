// Turns a Gemini extraction into the normalised facts the code gates read,
// and merges facts when several articles describe the same round. Pure: no I/O.
import type { ExtractedAnnouncement } from "@/lib/prompts/extract"
import { rootDomain } from "@/lib/domain"

export type Money = { amount: number; currency: string }

export type Facts = {
  is_funding_announcement: true
  company_name: string
  company_domain: string | null
  round_stage: string | null // normalised: pre-seed | seed | angel | seed extension | pre-series a | series x | late | <raw>
  round_stage_raw: string | null
  round_amount_usd: number | null
  round_amount_original: Money | null
  announced_date: string | null
  investors: string[]
  founders: { name: string; title: string | null }[]
  employee_count: number | null
  employee_count_source: "article" | "website" | "linkedin" | "unknown"
  founded_year: number | null
  total_raised_usd: number | null
  prior_rounds: string[]
  is_public: boolean | null
  parent_company: string | null
  is_acquired: boolean | null
  revenue_usd: number | null
  sector: string | null
  hq_country: string | null
  hq_city: string | null
  business_model: string | null
  what_they_do: string | null
  use_of_funds: string | null
  instrument: ExtractedAnnouncement["instrument"]
  raiser_type: ExtractedAnnouncement["raiser_type"]
  is_exit_event: boolean
  is_traditional_sme: boolean | null
  serial_founder_with_exit: boolean | null
  excluded_sector_match: string | null
  founder_quotes: { speaker: string; quote: string }[]
}

export type Evidence = Record<string, string>

export type FxConfig = { inr_per_usd: number; fx_per_usd?: Record<string, number> }

export function toUsd(amount: number | null, currency: string | null, fx: FxConfig): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null
  const cur = (currency ?? "USD").toUpperCase().replace("₹", "INR").replace("$", "USD")
  if (cur === "USD") return Math.round(amount)
  if (cur === "INR" || cur === "RS" || cur === "RUPEES") return Math.round(amount / fx.inr_per_usd)
  const rate = fx.fx_per_usd?.[cur]
  return rate ? Math.round(amount / rate) : null
}

export function normalizeStage(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.toLowerCase().replace(/[_–—]/g, "-").replace(/\s+/g, " ").trim()
  if (!s || /^(undisclosed|unknown|n\/?a|not disclosed)\b/.test(s)) return null
  if (/pre[- ]?series[- ]?a/.test(s)) return "pre-series a"
  if (/pre[- ]?seed/.test(s)) return "pre-seed"
  if (/seed ?(plus|\+|extension|ext\b|top[- ]?up|bridge)/.test(s)) return "seed extension"
  const series = s.match(/series[- ]?([a-h])\b/)
  if (series) return `series ${series[1]}`
  if (/\b(growth|late[- ]?stage|pre[- ]?ipo|mezzanine|ipo)\b/.test(s)) return "late"
  if (/\bangel\b/.test(s)) return "angel"
  if (/\bseed\b/.test(s)) return "seed"
  return s
}

export function isLateStage(stage: string | null): boolean {
  return !!stage && (/^series [a-h]$/.test(stage) || stage === "late")
}

export function factsFromExtraction(a: ExtractedAnnouncement, fx: FxConfig): { facts: Facts; evidence: Evidence } {
  const facts: Facts = {
    is_funding_announcement: true,
    company_name: a.company_name.trim(),
    company_domain: rootDomain(a.company_domain),
    round_stage: normalizeStage(a.round_stage),
    round_stage_raw: a.round_stage,
    round_amount_usd: toUsd(a.round_amount, a.round_currency, fx),
    round_amount_original: a.round_amount !== null ? { amount: a.round_amount, currency: (a.round_currency ?? "USD").toUpperCase() } : null,
    announced_date: /^\d{4}-\d{2}-\d{2}$/.test(a.announced_date ?? "") ? a.announced_date : null,
    investors: dedupeStrings(a.investors),
    founders: a.founders.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), title: f.title })),
    employee_count: a.employee_count,
    employee_count_source: a.employee_count === null ? "unknown" : a.employee_count_source,
    founded_year: a.founded_year,
    total_raised_usd: toUsd(a.total_raised_amount, a.total_raised_currency, fx),
    prior_rounds: a.prior_rounds.map((r) => normalizeStage(r) ?? r.toLowerCase()),
    is_public: a.is_public,
    parent_company: a.parent_company,
    is_acquired: a.is_acquired,
    revenue_usd: toUsd(a.revenue_amount, a.revenue_currency, fx),
    sector: a.sector,
    hq_country: a.hq_country,
    hq_city: a.hq_city,
    business_model: a.business_model,
    what_they_do: a.what_they_do,
    use_of_funds: a.use_of_funds,
    instrument: a.instrument,
    raiser_type: a.raiser_type,
    is_exit_event: a.is_exit_event,
    is_traditional_sme: a.is_traditional_sme,
    serial_founder_with_exit: a.serial_founder_with_exit,
    excluded_sector_match: a.excluded_sector_match,
    founder_quotes: a.founder_quotes,
  }
  const evidence: Evidence = {}
  for (const e of a.evidence) if (e.quote?.trim() && !evidence[e.field]) evidence[e.field] = e.quote.trim()
  return { facts, evidence }
}

function dedupeStrings(list: string[]): string[] {
  const seen = new Map<string, string>()
  for (const item of list) {
    const key = item.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim()
    if (key && !seen.has(key)) seen.set(key, item.trim())
  }
  return [...seen.values()]
}

// Several articles about one round merge into one set of facts: keep what we know,
// fill gaps from the new article, union lists, keep the earliest announcement date.
export function mergeFacts(base: Facts, incoming: Facts): Facts {
  const out = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(incoming)) {
    const current = out[key]
    if (Array.isArray(value)) continue
    if ((current === null || current === undefined || current === "unknown") && value !== null && value !== undefined) out[key] = value
  }
  const merged = out as Facts
  merged.investors = dedupeStrings([...base.investors, ...incoming.investors])
  const founders = new Map(base.founders.map((f) => [f.name.toLowerCase(), f]))
  for (const f of incoming.founders) {
    const key = f.name.toLowerCase()
    const existing = founders.get(key)
    if (!existing) founders.set(key, f)
    else if (!existing.title && f.title) founders.set(key, { ...existing, title: f.title })
  }
  merged.founders = [...founders.values()]
  merged.prior_rounds = [...new Set([...base.prior_rounds, ...incoming.prior_rounds])]
  const quotes = new Map(base.founder_quotes.map((q) => [q.quote, q]))
  for (const q of incoming.founder_quotes) quotes.set(q.quote, q)
  merged.founder_quotes = [...quotes.values()]
  if (base.announced_date && incoming.announced_date) {
    merged.announced_date = base.announced_date < incoming.announced_date ? base.announced_date : incoming.announced_date
  }
  if (base.instrument === "unknown" && incoming.instrument !== "unknown") merged.instrument = incoming.instrument
  return merged
}

export function mergeEvidence(base: Evidence, incoming: Evidence): Evidence {
  return { ...incoming, ...base }
}

// A new article changes a "hard fact" when it reports a different round.
export function hardFactsChanged(before: Facts, after: Facts): boolean {
  if (before.round_stage !== after.round_stage && after.round_stage !== null) return true
  const a = before.round_amount_usd
  const b = after.round_amount_usd
  return a !== null && b !== null && Math.abs(a - b) / Math.max(a, b) > 0.15
}
