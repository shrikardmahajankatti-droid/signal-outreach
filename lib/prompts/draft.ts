import { Type, type Schema } from "@google/genai"
import { z } from "zod"
import type { Facts } from "@/lib/qualification/facts"

export type AcceleratorProfile = {
  name: string
  one_liner: string
  offers: string[]
  sender_name: string
  application_url?: string
}

export type OpenerCandidate = { type: "founder_post" | "founder_quote" | "product_detail" | "shared_investor"; text: string; source?: string }

const emailSchema = (extra: Record<string, Schema> = {}): Schema => ({
  type: Type.OBJECT,
  properties: { subject: { type: Type.STRING }, body: { type: Type.STRING }, ...extra },
  required: ["subject", "body", ...Object.keys(extra)],
})

export const draftResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    body: { type: Type.STRING },
    opener_source: { type: Type.STRING, enum: ["founder_post", "founder_quote", "product_detail", "shared_investor"] },
    opener_fact: { type: Type.STRING },
    followups: {
      type: Type.ARRAY,
      items: emailSchema({ day: { type: Type.INTEGER } }),
    },
  },
  required: ["subject", "body", "opener_source", "opener_fact", "followups"],
}

export const draftZod = z.object({
  subject: z.string().min(3),
  body: z.string().min(20),
  opener_source: z.enum(["founder_post", "founder_quote", "product_detail", "shared_investor"]),
  opener_fact: z.string(),
  followups: z.array(z.object({ day: z.number().int(), subject: z.string(), body: z.string() })).length(3),
})
export type DraftResponse = z.infer<typeof draftZod>

export const rewriteResponseSchema: Schema = emailSchema()
export const rewriteZod = z.object({ subject: z.string().min(3), body: z.string().min(20) })

export function draftSystem(rules: { subjectMaxChars: number; bodyMaxWords: number; bannedPhrases: string[]; spamWords: string[] }) {
  return `You write short, personal cold emails from an accelerator recruiter to founders who just raised a pre-seed or seed round.
Follow these rules exactly (they are checked in code):
- Subject: under ${rules.subjectMaxChars} characters and must contain the company name. No clickbait, no exclamation marks.
- Body: under ${rules.bodyMaxWords - 15} words, plain text, no markdown, no links, no placeholders. Start with "Hi <founder first name>," on its own line.
- First sentence after the greeting uses ONE specific fact. Pick the opener in this order of preference: a founder's own post or quote › a concrete product detail › a shared investor. Never praise generically ("congrats on the raise" alone is not a fact).
- Then exactly one sentence on their likely next challenge after this round, and one sentence on how the accelerator helps with it (use the accelerator profile; don't invent programme details).
- End with exactly one low-friction yes/no question. The whole body contains exactly one question mark.
- Never use: ${rules.bannedPhrases.join("; ")}.
- Never use these spam words: ${rules.spamWords.join(", ")}.
- No exclamation marks anywhere. No sign-off or signature: a standard footer with the sender's name is appended automatically.
- Don't invent facts, numbers, names or quotes that aren't in the input.
- Name the source of the opener accurately: a [founder_quote] comes from press coverage of the round ("you told the press…", "in the announcement…"); only a [founder_post] may be called a post.
Follow-ups (days 3, 7 and 14): each under 90 words, same rules, each adds a NEW angle (e.g. a hiring or GTM resource, a peer founder story in their sector, the application timeline). Day 14 is a polite close-the-loop that makes it easy to say "not now". Each has exactly one question.`
}

export function buildDraftPrompt(input: {
  facts: Facts
  founder: { name: string; title: string | null } | null
  openers: OpenerCandidate[]
  website: string | null
  accelerator: AcceleratorProfile
  fitReasons: string[]
}): string {
  const { facts } = input
  return `ACCELERATOR PROFILE
${JSON.stringify(input.accelerator, null, 2)}

RECIPIENT: ${input.founder ? `${input.founder.name}${input.founder.title ? `, ${input.founder.title}` : ""}` : "the founding team"} at ${facts.company_name}

OPENER CANDIDATES (best first; use one, keep quotes verbatim if you quote)
${input.openers.map((o, i) => `${i + 1}. [${o.type}] ${o.text}${o.source ? ` (source: ${o.source})` : ""}`).join("\n") || "- none: use a product detail from the facts"}

FACTS
${JSON.stringify(
  {
    company: facts.company_name,
    round: facts.round_stage_raw ?? facts.round_stage,
    amount_usd: facts.round_amount_usd,
    amount_original: facts.round_amount_original,
    investors: facts.investors,
    sector: facts.sector,
    what_they_do: facts.what_they_do,
    use_of_funds: facts.use_of_funds,
    hq: [facts.hq_city, facts.hq_country].filter(Boolean).join(", "),
  },
  null,
  2
)}

WHY THEY FIT
${input.fitReasons.map((r) => `- ${r}`).join("\n")}

WEBSITE EXCERPT
${(input.website ?? "n/a").slice(0, 1500)}

Write the email and the day 3, 7 and 14 follow-ups. Set opener_source to the candidate type you used and opener_fact to the fact itself.`
}

export function buildRewritePrompt(email: { subject: string; body: string }, failures: string[]): string {
  return `Rewrite this cold email so it passes every rule. Keep the same opener fact and ask. Fix only what's needed.

FAILED CHECKS
${failures.map((f) => `- ${f}`).join("\n")}

SUBJECT: ${email.subject}

BODY:
${email.body}`
}
