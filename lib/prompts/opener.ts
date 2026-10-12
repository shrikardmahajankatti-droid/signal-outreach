import { Type, type Schema } from "@google/genai"
import { z } from "zod"

export const openerResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: { body: { type: Type.STRING }, opener_fact: { type: Type.STRING } },
  required: ["body", "opener_fact"],
}
export const openerZod = z.object({ body: z.string().min(20), opener_fact: z.string() })

export const OPENER_SYSTEM = `You rewrite only the opening line of a cold email so it references a founder's LinkedIn post.
Keep the greeting line, keep every other sentence exactly as it is, keep exactly one question mark in the whole body,
no exclamation marks, no markdown, no sign-off. The new first sentence after the greeting must cite one specific point
from the post (paraphrase or a short verbatim quote) and say it was their LinkedIn post. Don't invent anything that isn't in the post.`

export function buildOpenerPrompt(body: string, post: string): string {
  return `LINKEDIN POST (pasted by Rohit):
${post.slice(0, 3000)}

CURRENT EMAIL BODY:
${body}`
}
