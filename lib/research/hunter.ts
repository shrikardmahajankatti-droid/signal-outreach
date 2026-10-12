// Hunter.io (free plan ≈ 50 credits/month): Email Finder (name + domain/company) and Email Verifier.
// Every call goes through a monthly budget guard; results are cached on the founder row.
import { getDb, schema } from "@/db"
import { getSetting } from "@/lib/config"
import { fetchWithTimeout } from "@/lib/http"

const BASE = "https://api.hunter.io/v2"

export function hunterEnabled(): boolean {
  return Boolean(process.env.HUNTER_API_KEY)
}

function monthKey() {
  return new Date().toISOString().slice(0, 7)
}

// Local budget: HUNTER_MONTHLY_CAP (default 45) lookups per calendar month, counted before each call.
export async function hunterBudget(): Promise<{ used: number; cap: number; left: number }> {
  const cap = Number(process.env.HUNTER_MONTHLY_CAP ?? 45)
  const usage = await getSetting<{ month: string; calls: number }>("hunter_usage")
  const used = usage?.month === monthKey() ? usage.calls : 0
  return { used, cap, left: Math.max(0, cap - used) }
}

async function spend() {
  const { used } = await hunterBudget()
  const value = { month: monthKey(), calls: used + 1 }
  await getDb().insert(schema.appSettings).values({ key: "hunter_usage", value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } })
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.HUNTER_API_KEY
  if (!key) throw new Error("HUNTER_API_KEY not set")
  const { left } = await hunterBudget()
  if (left <= 0) throw new Error("Hunter monthly budget used up (HUNTER_MONTHLY_CAP)")
  await spend()
  const res = await fetchWithTimeout(`${BASE}/${path}?${new URLSearchParams({ ...params, api_key: key })}`, { timeoutMs: 20000 })
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { details?: string }[] }
  if (!res.ok) throw new Error(`Hunter ${res.status}: ${body.errors?.[0]?.details ?? "request failed"}`)
  return body.data as T
}

export type HunterFind = {
  email: string | null
  score: number | null
  status: string | null // valid | accept_all | invalid | unknown | null
  sources: string[]
}

export async function hunterFindEmail(opts: { firstName: string; lastName: string; domain?: string | null; company?: string | null }): Promise<HunterFind> {
  const params: Record<string, string> = { first_name: opts.firstName, last_name: opts.lastName }
  if (opts.domain) params.domain = opts.domain
  else if (opts.company) params.company = opts.company
  else throw new Error("Hunter needs a domain or company name")
  type R = { email: string | null; score: number | null; verification?: { status: string | null }; sources?: { uri: string }[] }
  const d = await call<R>("email-finder", params)
  return { email: d?.email ?? null, score: d?.score ?? null, status: d?.verification?.status ?? null, sources: (d?.sources ?? []).map((s) => s.uri).slice(0, 5) }
}

export type HunterVerify = { status: string; result: string | null; score: number | null }

export async function hunterVerify(email: string): Promise<HunterVerify> {
  type R = { status: string; result?: string; score?: number }
  const d = await call<R>("email-verifier", { email })
  return { status: d.status, result: d.result ?? null, score: d.score ?? null }
}

// Real remaining credits from Hunter (no credit spent).
export async function hunterAccount(): Promise<{ plan: string; searchesLeft: number | null; verificationsLeft: number | null } | null> {
  const key = process.env.HUNTER_API_KEY
  if (!key) return null
  const res = await fetchWithTimeout(`${BASE}/account?api_key=${key}`, { timeoutMs: 10000 })
  if (!res.ok) return null
  const d = ((await res.json()) as {
    data?: { plan_name?: string; requests?: { searches?: { available?: number; used?: number }; verifications?: { available?: number; used?: number }; credits?: { available?: number; used?: number } } }
  }).data
  const r = d?.requests
  const left = (x?: { available?: number; used?: number }) => (x?.available !== undefined ? x.available - (x.used ?? 0) : null)
  return { plan: d?.plan_name ?? "?", searchesLeft: left(r?.searches ?? r?.credits), verificationsLeft: left(r?.verifications ?? r?.credits) }
}
