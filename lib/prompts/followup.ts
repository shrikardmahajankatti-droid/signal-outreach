import { Type, type Schema } from "@google/genai"
import { z } from "zod"

export const followupResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: { subject: { type: Type.STRING }, body: { type: Type.STRING }, angle: { type: Type.STRING } },
  required: ["subject", "body", "angle"],
}
export const followupZod = z.object({ subject: z.string().min(3), body: z.string().min(20), angle: z.string() })

export function followupSystem(rules: { bannedPhrases: string[]; spamWords: string[] }, maxWords: number) {
  return `You write a short follow-up to a cold email an accelerator recruiter sent a founder who just raised a seed round.
Rules (checked in code):
- Under ${maxWords - 15} words, plain text, no markdown, no links, no sign-off (a footer is appended automatically).
- Start with "Hi <founder first name>," on its own line, then 2 short paragraphs separated by a blank line.
- Add ONE new angle not used in the earlier emails (e.g. a concrete hiring/GTM resource, a peer founder in their sector, the application timeline, a specific mentor type). Never just "bumping this".
- Exactly one yes/no question; the body has exactly one question mark. No exclamation marks.
- On the last follow-up (day 14 or later) politely close the loop and make "not now" easy.
- Never use: ${rules.bannedPhrases.join("; ")}. Never use: ${rules.spamWords.join(", ")}.
- Don't invent facts about the company that aren't in the input.
Subject: short, may start with "Re:" plus the original subject.`
}

export function buildFollowupPrompt(input: {
  day: number
  isLast: boolean
  original: { subject: string; body: string }
  previous: { day: number; body: string }[]
  facts: unknown
  founderName: string | null
  accelerator: unknown
  angle?: string
  newInfo?: string[]
}) {
  return `FOLLOW-UP FOR DAY ${input.day}${input.isLast ? " (last one: close the loop)" : ""}
RECIPIENT: ${input.founderName ?? "the founder"}
${input.angle ? `ROHIT'S REQUESTED ANGLE: ${input.angle}\n` : ""}
ORIGINAL EMAIL (subject: ${input.original.subject})
${input.original.body.split("\n—\n")[0]}

${input.previous.length ? `FOLLOW-UPS ALREADY SENT\n${input.previous.map((p) => `Day ${p.day}:\n${p.body.split("\n—\n")[0]}`).join("\n\n")}\n` : ""}
COMPANY FACTS
${JSON.stringify(input.facts, null, 2).slice(0, 2500)}

${input.newInfo?.length ? `RECENT PUBLIC POSTS / NEWS (may give a fresh angle)\n${input.newInfo.map((n) => `- ${n}`).join("\n")}\n` : ""}
ACCELERATOR PROFILE
${JSON.stringify(input.accelerator, null, 2)}`
}
