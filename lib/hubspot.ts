// HubSpot CRM sync: the "Accelerator Outreach" deal pipeline, and a Company + Contact + Deal
// per drafted startup. Uses @hubspot/api-client with a service key (HUBSPOT_ACCESS_TOKEN).
import { Client } from "@hubspot/api-client"
import { and, asc, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getSetting } from "@/lib/config"
import type { Facts } from "@/lib/qualification/facts"

export const PIPELINE_LABEL = "Accelerator Outreach"

export const STAGES = [
  { key: "draft_ready", label: "Draft ready", probability: "0.1" },
  { key: "email_sent", label: "Email sent", probability: "0.2" },
  { key: "followup_sent", label: "Follow-up sent", probability: "0.25" },
  { key: "replied", label: "Replied", probability: "0.4" },
  { key: "meeting_booked", label: "Meeting booked", probability: "0.6" },
  { key: "applied", label: "Applied", probability: "1.0", isClosed: true },
  { key: "not_pursued", label: "Not a fit / Not pursued", probability: "0.0", isClosed: true },
] as const
export type StageKey = (typeof STAGES)[number]["key"]
// Stages at or beyond "Replied" stop follow-ups.
export const REPLIED_OR_LATER: StageKey[] = ["replied", "meeting_booked", "applied", "not_pursued"]

export type PipelineConfig = { pipelineId: string; stages: Record<StageKey, string> }

const DEAL_PROPERTIES = [
  { name: "signal_round", label: "Round (Signal)", type: "string", fieldType: "text" },
  { name: "signal_investors", label: "Investors (Signal)", type: "string", fieldType: "textarea" },
  { name: "signal_fit_score", label: "Fit score (Signal)", type: "number", fieldType: "number" },
  { name: "signal_app_link", label: "Signal link", type: "string", fieldType: "text" },
] as const

let _client: Client | null = null
export function hubspotEnabled(): boolean {
  return Boolean(process.env.HUBSPOT_ACCESS_TOKEN)
}
function hs(): Client {
  if (_client) return _client
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN
  if (!accessToken) throw new Error("HUBSPOT_ACCESS_TOKEN not set")
  _client = new Client({ accessToken, numberOfApiCallRetries: 2 })
  return _client
}

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await hs().apiRequest({ method, path, body: body as object | undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(`HubSpot ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : {}) as T
}

// ─── Setup (scripts/setup.ts) ────────────────────────────────────────────────

export async function ensurePipeline(): Promise<PipelineConfig> {
  type Pipeline = { id: string; label: string; stages: { id: string; label: string }[] }
  const { results } = await api<{ results: Pipeline[] }>("GET", "/crm/v3/pipelines/deals")
  let pipeline = results.find((p) => p.label === PIPELINE_LABEL)
  if (!pipeline) {
    pipeline = await api<Pipeline>("POST", "/crm/v3/pipelines/deals", {
      label: PIPELINE_LABEL,
      displayOrder: 1,
      stages: STAGES.map((s, i) => ({
        label: s.label,
        displayOrder: i,
        metadata: { probability: s.probability, ...("isClosed" in s ? { isClosed: "true" } : {}) },
      })),
    })
  }
  const stages = Object.fromEntries(
    STAGES.map((s) => {
      const found = pipeline!.stages.find((x) => x.label === s.label)
      if (!found) throw new Error(`HubSpot pipeline is missing stage "${s.label}"`)
      return [s.key, found.id]
    })
  ) as Record<StageKey, string>
  return { pipelineId: pipeline.id, stages }
}

export async function ensureDealProperties(): Promise<void> {
  const { results } = await api<{ results: { name: string }[] }>("GET", "/crm/v3/properties/deals")
  const existing = new Set(results.map((p) => p.name))
  for (const p of DEAL_PROPERTIES) {
    if (existing.has(p.name)) continue
    await api("POST", "/crm/v3/properties/deals", { ...p, groupName: "dealinformation" })
  }
}

async function pipelineConfig(): Promise<PipelineConfig> {
  const cfg = await getSetting<PipelineConfig>("hubspot_pipeline")
  if (!cfg) throw new Error("HubSpot pipeline not set up. Run `npm run setup`.")
  return cfg
}

// ─── Sync (step 7) ───────────────────────────────────────────────────────────

type SearchResult = { results: { id: string; properties: Record<string, string | null> }[] }

async function findCompany(domain: string | null, name: string): Promise<string | null> {
  const filters = domain
    ? [{ propertyName: "domain", operator: "EQ", value: domain }]
    : [{ propertyName: "name", operator: "EQ", value: name }]
  const res = await api<SearchResult>("POST", "/crm/v3/objects/companies/search", { filterGroups: [{ filters }], limit: 1 })
  return res.results[0]?.id ?? null
}

async function findContact(email: string | null, first: string, last: string, company: string): Promise<string | null> {
  const filters = email
    ? [{ propertyName: "email", operator: "EQ", value: email }]
    : [
        { propertyName: "firstname", operator: "EQ", value: first },
        { propertyName: "lastname", operator: "EQ", value: last },
        { propertyName: "company", operator: "EQ", value: company },
      ]
  const res = await api<SearchResult>("POST", "/crm/v3/objects/contacts/search", { filterGroups: [{ filters }], limit: 1 })
  return res.results[0]?.id ?? null
}

async function associate(fromType: string, fromId: string, toType: string, toId: string) {
  await api("PUT", `/crm/v4/objects/${fromType}/${fromId}/associations/default/${toType}/${toId}`)
}

const appLink = (startupId: number) => `${(process.env.APP_URL || "").replace(/\/$/, "")}/leads/${startupId}`

export type HubSpotAccount = { portalId: number; uiDomain: string }

export async function fetchAccount(): Promise<HubSpotAccount> {
  const d = await api<{ portalId: number; uiDomain: string }>("GET", "/account-info/v3/details")
  return { portalId: d.portalId, uiDomain: d.uiDomain }
}

export function hubspotDealUrl(dealId: string | null, account: HubSpotAccount | null): string | null {
  if (!dealId || !account) return null
  return `https://${account.uiDomain}/contacts/${account.portalId}/record/0-3/${dealId}`
}

// Upserts Company (deduped by domain), founder Contact and Deal at "Draft ready", and associates them.
export async function syncStartupToHubSpot(startupId: number): Promise<{ companyId: string; dealId: string; contactId: string | null }> {
  const db = getDb()
  const [s] = await db.select().from(schema.startups).where(eq(schema.startups.id, startupId))
  if (!s) throw new Error(`startup ${startupId} not found`)
  const facts = s.facts as Facts
  const cfg = await pipelineConfig()

  const companyProps = {
    name: s.name,
    ...(s.rootDomain ? { domain: s.rootDomain } : {}),
    ...(facts.hq_city ? { city: facts.hq_city } : {}),
    ...(facts.hq_country ? { country: facts.hq_country } : {}),
    description: [facts.what_they_do, facts.sector].filter(Boolean).join(" · ").slice(0, 1000),
  }
  let companyId = s.hubspotCompanyId ?? (await findCompany(s.rootDomain, s.name))
  if (companyId) await api("PATCH", `/crm/v3/objects/companies/${companyId}`, { properties: companyProps })
  else companyId = (await api<{ id: string }>("POST", "/crm/v3/objects/companies", { properties: companyProps })).id

  // Founder contact: the draft's recipient, else the first founder.
  const [draft] = await db.select().from(schema.drafts).where(eq(schema.drafts.startupId, s.id))
  const founders = await db.select().from(schema.founders).where(eq(schema.founders.startupId, s.id)).orderBy(asc(schema.founders.id))
  const founder = founders.find((f) => f.id === draft?.founderId) ?? founders[0]
  let contactId: string | null = null
  if (founder) {
    const [first, ...rest] = founder.name.split(" ")
    const last = rest.join(" ") || "-"
    const email = draft?.toEmail ?? founder.email ?? null
    const props = {
      firstname: first,
      lastname: last,
      company: s.name,
      ...(founder.title ? { jobtitle: founder.title } : {}),
      ...(email ? { email } : {}),
      ...(founder.linkedinUrl ? { hs_linkedin_url: founder.linkedinUrl } : {}),
    }
    contactId = founder.hubspotContactId ?? (await findContact(email, first, last, s.name))
    if (contactId) await api("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties: props })
    else contactId = (await api<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: props })).id
    await db.update(schema.founders).set({ hubspotContactId: contactId }).where(eq(schema.founders.id, founder.id))
  }

  const dealProps = {
    dealname: `${s.name}: ${facts.round_stage_raw ?? facts.round_stage ?? "round"}`,
    pipeline: cfg.pipelineId,
    ...(facts.round_amount_usd ? { amount: String(facts.round_amount_usd) } : {}),
    signal_round: [facts.round_stage_raw ?? facts.round_stage, facts.announced_date].filter(Boolean).join(" · "),
    signal_investors: facts.investors.join(", "),
    ...(s.fitScore !== null ? { signal_fit_score: String(s.fitScore) } : {}),
    signal_app_link: appLink(s.id),
  }
  let dealId = s.hubspotDealId
  if (dealId) await api("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: dealProps })
  else {
    dealId = (await api<{ id: string }>("POST", "/crm/v3/objects/deals", { properties: { ...dealProps, dealstage: cfg.stages.draft_ready } })).id
  }

  await associate("deals", dealId, "companies", companyId)
  if (contactId) {
    await associate("deals", dealId, "contacts", contactId)
    await associate("contacts", contactId, "companies", companyId)
  }
  await db
    .update(schema.startups)
    .set({ hubspotCompanyId: companyId, hubspotDealId: dealId, ...(s.dealStage ? {} : { dealStage: "draft_ready" }) })
    .where(eq(schema.startups.id, s.id))
  return { companyId, dealId, contactId }
}

export async function moveDeal(startupId: number, stage: StageKey): Promise<void> {
  const db = getDb()
  const [s] = await db.select({ dealId: schema.startups.hubspotDealId }).from(schema.startups).where(eq(schema.startups.id, startupId))
  if (!s?.dealId) return
  const cfg = await pipelineConfig()
  await api("PATCH", `/crm/v3/objects/deals/${s.dealId}`, { properties: { dealstage: cfg.stages[stage] } })
}

export async function getDealStage(startupId: number): Promise<StageKey | null> {
  const db = getDb()
  const [s] = await db.select({ dealId: schema.startups.hubspotDealId }).from(schema.startups).where(eq(schema.startups.id, startupId))
  if (!s?.dealId) return null
  const cfg = await pipelineConfig()
  const deal = await api<{ properties: { dealstage: string } }>("GET", `/crm/v3/objects/deals/${s.dealId}?properties=dealstage`)
  const entry = Object.entries(cfg.stages).find(([, id]) => id === deal.properties.dealstage)
  return (entry?.[0] as StageKey) ?? null
}

// Logs an email (or any event) on the deal timeline as a note.
// (The service key has no email-engagement scope, so notes carry the subject + body.)
export async function logOnTimeline(startupId: number, html: string): Promise<void> {
  const db = getDb()
  const [s] = await db
    .select({ dealId: schema.startups.hubspotDealId, companyId: schema.startups.hubspotCompanyId })
    .from(schema.startups)
    .where(eq(schema.startups.id, startupId))
  if (!s?.dealId) return
  const [founder] = await db
    .select({ contactId: schema.founders.hubspotContactId })
    .from(schema.founders)
    .where(and(eq(schema.founders.startupId, startupId)))
    .orderBy(asc(schema.founders.id))
  const associations = [
    { to: { id: s.dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] },
    ...(s.companyId ? [{ to: { id: s.companyId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 190 }] }] : []),
    ...(founder?.contactId ? [{ to: { id: founder.contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }] : []),
  ]
  await api("POST", "/crm/v3/objects/notes", {
    properties: { hs_timestamp: new Date().toISOString(), hs_note_body: html.slice(0, 60000) },
    associations,
  })
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
