import { Type, type Schema } from "@google/genai"
import { z } from "zod"

// Fields from qualification.md section 8, plus the few extra facts the code gates need
// (instrument, who raised, exit event, excluded-sector match…). Gemini extracts; code decides.

const nullableString = { type: Type.STRING, nullable: true }
const nullableNumber = { type: Type.NUMBER, nullable: true }
const nullableBool = { type: Type.BOOLEAN, nullable: true }

const announcementSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    company_name: { type: Type.STRING },
    company_domain: nullableString,
    round_stage: nullableString,
    round_amount: nullableNumber,
    round_currency: nullableString,
    announced_date: nullableString,
    investors: { type: Type.ARRAY, items: { type: Type.STRING } },
    founders: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, title: nullableString }, required: ["name", "title"] },
    },
    employee_count: nullableNumber,
    employee_count_source: { type: Type.STRING, enum: ["article", "unknown"] },
    founded_year: nullableNumber,
    total_raised_amount: nullableNumber,
    total_raised_currency: nullableString,
    prior_rounds: { type: Type.ARRAY, items: { type: Type.STRING } },
    is_public: nullableBool,
    parent_company: nullableString,
    is_acquired: nullableBool,
    revenue_amount: nullableNumber,
    revenue_currency: nullableString,
    sector: nullableString,
    hq_country: nullableString,
    hq_city: nullableString,
    business_model: nullableString,
    what_they_do: nullableString,
    use_of_funds: nullableString,
    instrument: { type: Type.STRING, enum: ["equity", "convertible", "debt", "mixed", "grant", "prize", "crowdfunding", "unknown"] },
    raiser_type: { type: Type.STRING, enum: ["startup", "vc_fund", "accelerator", "incubator", "established_company", "other"] },
    is_exit_event: { type: Type.BOOLEAN },
    is_traditional_sme: nullableBool,
    serial_founder_with_exit: nullableBool,
    excluded_sector_match: nullableString,
    founder_quotes: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { speaker: { type: Type.STRING }, quote: { type: Type.STRING } }, required: ["speaker", "quote"] },
    },
    evidence: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { field: { type: Type.STRING }, quote: { type: Type.STRING } }, required: ["field", "quote"] },
    },
  },
  required: [
    "company_name", "company_domain", "round_stage", "round_amount", "round_currency", "announced_date", "investors",
    "founders", "employee_count", "employee_count_source", "founded_year", "total_raised_amount", "total_raised_currency",
    "prior_rounds", "is_public", "parent_company", "is_acquired", "revenue_amount", "revenue_currency", "sector",
    "hq_country", "hq_city", "business_model", "what_they_do", "use_of_funds", "instrument", "raiser_type", "is_exit_event",
    "is_traditional_sme", "serial_founder_with_exit", "excluded_sector_match", "founder_quotes", "evidence",
  ],
}

export const extractResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    articles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          article_index: { type: Type.INTEGER },
          is_funding_announcement: { type: Type.BOOLEAN },
          not_funding_reason: nullableString,
          announcements: { type: Type.ARRAY, items: announcementSchema },
        },
        required: ["article_index", "is_funding_announcement", "not_funding_reason", "announcements"],
      },
    },
  },
  required: ["articles"],
}

const announcementZod = z.object({
  company_name: z.string().min(1),
  company_domain: z.string().nullable(),
  round_stage: z.string().nullable(),
  round_amount: z.number().nullable(),
  round_currency: z.string().nullable(),
  announced_date: z.string().nullable(),
  investors: z.array(z.string()),
  founders: z.array(z.object({ name: z.string(), title: z.string().nullable() })),
  employee_count: z.number().nullable(),
  employee_count_source: z.enum(["article", "unknown"]),
  founded_year: z.number().nullable(),
  total_raised_amount: z.number().nullable(),
  total_raised_currency: z.string().nullable(),
  prior_rounds: z.array(z.string()),
  is_public: z.boolean().nullable(),
  parent_company: z.string().nullable(),
  is_acquired: z.boolean().nullable(),
  revenue_amount: z.number().nullable(),
  revenue_currency: z.string().nullable(),
  sector: z.string().nullable(),
  hq_country: z.string().nullable(),
  hq_city: z.string().nullable(),
  business_model: z.string().nullable(),
  what_they_do: z.string().nullable(),
  use_of_funds: z.string().nullable(),
  instrument: z.enum(["equity", "convertible", "debt", "mixed", "grant", "prize", "crowdfunding", "unknown"]),
  raiser_type: z.enum(["startup", "vc_fund", "accelerator", "incubator", "established_company", "other"]),
  is_exit_event: z.boolean(),
  is_traditional_sme: z.boolean().nullable(),
  serial_founder_with_exit: z.boolean().nullable(),
  excluded_sector_match: z.string().nullable(),
  founder_quotes: z.array(z.object({ speaker: z.string(), quote: z.string() })),
  evidence: z.array(z.object({ field: z.string(), quote: z.string() })),
})

export const extractZod = z.object({
  articles: z.array(
    z.object({
      article_index: z.number().int(),
      is_funding_announcement: z.boolean(),
      not_funding_reason: z.string().nullable(),
      announcements: z.array(announcementZod),
    })
  ),
})

export type ExtractedAnnouncement = z.infer<typeof announcementZod>
export type ExtractResponse = z.infer<typeof extractZod>

export const EXTRACT_SYSTEM = `You extract facts from startup funding news for an accelerator's outreach pipeline.
You never decide whether a company is accepted or rejected. You only report facts that are stated.

Rules:
- Use null when a fact is not stated. Never guess, infer from general knowledge, or fill in typical values.
- Every non-null fact needs an evidence item: {field, quote}, where quote is a short verbatim excerpt (under 30 words) from the article.
- An article can mention several companies raising money (e.g. a weekly roundup). Return one announcement per company that has concrete round details (at least an amount, a stage or named investors). Skip companies mentioned only by name.
- is_funding_announcement is false for product launches, hiring, awards, opinion pieces, fund closes by VCs with no startup, and roundups that list no round details. Then return announcements: [] and give not_funding_reason.
- A VC fund, accelerator or incubator raising its own fund → raiser_type "vc_fund" / "accelerator" / "incubator".
- round_stage: the label used in the article, lower-case (e.g. "pre-seed", "seed", "seed extension", "pre-series a", "series a", "undisclosed"). "Seed Plus" / "Seed+" → "seed extension".
- round_amount: the full number in the stated currency, expanded (₹32 crore → 320000000 with round_currency "INR"; $3.3 million → 3300000 "USD"; ₹6 lakh → 600000 "INR"). If both INR and USD are given, use the INR figure. Do not convert currencies.
- instrument: "debt" for venture debt / loans / revenue-based financing only; "mixed" when the round combines equity and debt; "unknown" when not stated.
- announced_date: YYYY-MM-DD only if the article states or clearly dates the announcement; otherwise null.
- company_domain: only if the website/domain appears in the text (e.g. "desible.ai"). Never construct one from the name.
- founders: only people named as founder/co-founder/CEO of the raising company.
- prior_rounds: earlier rounds of this company named in the article (e.g. ["pre-seed"]).
- is_traditional_sme: true only when the text says it is an established non-tech business (manufacturer, trader, distributor, franchise, agency) raising its first outside money after years of operating.
- excluded_sector_match: if the company's core business clearly falls in one of the EXCLUDED SECTORS listed in the prompt, return that list item verbatim; otherwise null.
- serial_founder_with_exit: true only if the article says a founder previously built and exited a company.
- founder_quotes: verbatim quotes attributed to a founder, if any.
- what_they_do / use_of_funds / business_model: one plain sentence each from the article, or null.`

export type ExtractInput = { index: number; title: string; source: string; publishedAt: string | null; text: string }

export function buildExtractPrompt(articles: ExtractInput[], excludedSectors: string[]): string {
  const blocks = articles
    .map(
      (a) => `### ARTICLE ${a.index}
Title: ${a.title}
Source: ${a.source}
Published: ${a.publishedAt ?? "unknown"}

${a.text}`
    )
    .join("\n\n")
  return `EXCLUDED SECTORS (return the matching item verbatim in excluded_sector_match):
${excludedSectors.map((s) => `- ${s}`).join("\n")}

Extract facts from each of the ${articles.length} articles below. Return one entry in "articles" per article, using its ARTICLE number as article_index.

${blocks}`
}
