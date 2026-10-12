import { GoogleGenAI, type Schema } from "@google/genai"
import type { z } from "zod"

// Every AI task in Signal goes through Gemini Flash. The model comes from GEMINI_MODEL.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"

let client: GoogleGenAI | null = null
function ai(): GoogleGenAI {
  if (client) return client
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set")
  client = new GoogleGenAI({ apiKey })
  return client
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// JSON output is enforced twice: Gemini's responseSchema, then Zod validation.
export async function generateJson<T>(opts: {
  system: string
  prompt: string
  responseSchema: Schema
  zod: z.ZodType<T>
  temperature?: number
  retries?: number
}): Promise<T> {
  const { retries = 2 } = opts
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: geminiModel(),
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseSchema: opts.responseSchema,
          temperature: opts.temperature ?? 0.1,
        },
      })
      const text = res.text
      if (!text) throw new Error("Gemini returned an empty response")
      return opts.zod.parse(JSON.parse(text))
    } catch (err) {
      lastError = err
      const msg = String((err as Error)?.message ?? err)
      // Back off on rate limits / transient errors; validation errors get one more try too.
      if (attempt < retries) await sleep((/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/.test(msg) ? 8000 : 1500) * (attempt + 1))
    }
  }
  throw lastError
}
