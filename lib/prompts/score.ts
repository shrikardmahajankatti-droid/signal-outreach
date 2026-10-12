import { Type, type Schema } from "@google/genai"
import { z } from "zod"
import type { Facts } from "@/lib/qualification/facts"
import type { Thesis } from "@/lib/config"

// Gemini judges each thesis factor 0–100. The weighted total is computed in code from the
// live thesis weights, so changing a weight in Neon changes the next run's scores.
export const FACTORS = ["sector", "geography", "business_model", "team", "timing"] as const
export type Factor = (typeof FACTORS)[number]

export const scoreResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    factor_scores: {
      type: Type.OBJECT,
      properties: Object.fromEntries(FACTORS.map((f) => [f, { type: Type.INTEGER }])),
      required: [...FACTORS],
    },
    reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
    flags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["factor_scores", "reasons", "flags"],
}

export const scoreZod = z.object({
  factor_scores: z.object(Object.fromEntries(FACTORS.map((f) => [f, z.number().min(0).max(100)])) as Record<Factor, z.ZodNumber>),
  reasons: z.array(z.string()).min(1).max(6),
  flags: z.array(z.string()).max(6),
})
export type ScoreResponse = z.infer<typeof scoreZod>

export const SCORE_SYSTEM = `You score how well a freshly funded startup fits an early-stage accelerator's thesis.
Score each factor from 0 to 100 using only the facts and research provided. When unsure about fit, score low.
- sector: does the core business match a thesis sector? Score the closest one. A product whose core is built on AI/ML matches "AI/ML" whoever the customer is. Consumer-facing fintech software (wealth, credit, payments apps) is a partial match for fintech (60–80); fintech infrastructure for businesses is a full match. Pure consumer brands, restaurants, D2C retail and services firms score low even if they use technology.
- geography: India primary; SEA and global-from-India count.
- business_model: tech-enabled and scalable scores high; pure services/agency, franchise or asset-heavy operations score low.
- team: technical co-founder, domain experience, prior startup experience. Named co-founders with relevant titles or backgrounds in the research score 55–80; no information at all → around 40.
- timing: fresh capital and a likely need for go-to-market, hiring or fundraising help.
reasons: 2–5 short, specific sentences that cite facts (e.g. "B2B AI for banks matches AI/ML and fintech infra").
flags: short snake_case notes Rohit should check (e.g. services_heavy_model, b2c_consumer_brand), or [].
Use the labelled past feedback from Rohit as calibration examples.`

export function buildScorePrompt(input: {
  facts: Facts
  research: unknown
  thesis: Thesis
  feedback: { company: string; label: string; note: string | null; sector: string | null }[]
}): string {
  const { facts, thesis } = input
  return `THESIS (live from Neon)
- Sectors: ${thesis.sectors.join(", ")}
- Geographies: ${thesis.geographies.join(", ")}
- Business models: ${thesis.businessModels.join(", ")}
- Team signals: ${thesis.teamSignals.join(", ")}
- Timing: ${thesis.timingSignals.join(", ")}
- Excluded sectors: ${thesis.excludedSectors.join(", ")}
- Factor weights: ${JSON.stringify(thesis.weights)}

PAST FEEDBACK FROM ROHIT (most recent first)
${input.feedback.length ? input.feedback.map((f) => `- ${f.company} (${f.sector ?? "?"}): ${f.label}${f.note ? `, "${f.note}"` : ""}`).join("\n") : "- none yet"}

STARTUP FACTS
${JSON.stringify(
  {
    company: facts.company_name,
    domain: facts.company_domain,
    round: facts.round_stage,
    amount_usd: facts.round_amount_usd,
    investors: facts.investors,
    founders: facts.founders,
    founded_year: facts.founded_year,
    sector: facts.sector,
    business_model: facts.business_model,
    what_they_do: facts.what_they_do,
    use_of_funds: facts.use_of_funds,
    hq: [facts.hq_city, facts.hq_country].filter(Boolean).join(", "),
    serial_founder_with_exit: facts.serial_founder_with_exit,
  },
  null,
  2
)}

RESEARCH
${JSON.stringify(input.research ?? {}, null, 2).slice(0, 5000)}`
}
