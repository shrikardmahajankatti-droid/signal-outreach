"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { previewRules, type PreviewResult, type RulesPayload } from "@/lib/thesis-preview"

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string }

function check(p: RulesPayload) {
  const w = Object.values(p.thesis.weights)
  if (w.some((x) => x < 0 || x > 100)) throw new Error("Weights must be between 0 and 100")
  if (w.reduce((a, b) => a + b, 0) === 0) throw new Error("At least one weight must be above 0")
  if (p.thesis.maybeThreshold > p.thesis.fitThreshold) throw new Error("Maybe threshold must be below the fit threshold")
  if (p.thesis.sectors.length === 0) throw new Error("Add at least one sector")
  for (const [k, v] of Object.entries(p.config)) {
    if (typeof v === "number" && (!Number.isFinite(v) || v < 0)) throw new Error(`${k} must be a positive number`)
  }
}

export async function previewAction(p: RulesPayload): Promise<Result<PreviewResult>> {
  try {
    return { ok: true, data: await previewRules(p) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// Writes to Neon; every stage reads these fresh, so they apply from the next run.
export async function saveRulesAction(p: RulesPayload): Promise<Result> {
  try {
    check(p)
    const db = getDb()
    const config = { ...p.config, fit_threshold: p.thesis.fitThreshold, maybe_threshold: p.thesis.maybeThreshold }
    for (const [key, value] of Object.entries(config)) {
      await db.update(schema.qualificationConfig).set({ value }).where(eq(schema.qualificationConfig.key, key))
    }
    await db
      .update(schema.thesis)
      .set({
        sectors: p.thesis.sectors,
        geographies: p.thesis.geographies,
        businessModels: p.thesis.businessModels,
        teamSignals: p.thesis.teamSignals,
        excludedSectors: p.thesis.excludedSectors,
        weights: p.thesis.weights,
        fitThreshold: p.thesis.fitThreshold,
        maybeThreshold: p.thesis.maybeThreshold,
      })
      .where(eq(schema.thesis.active, true))
    revalidatePath("/thesis")
    return { ok: true, message: "Saved. Applies from the next run." }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export type EmailRulesPayload = { subjectMaxChars: number; bodyMaxWords: number; bannedPhrases: string[]; spamWords: string[]; footer: string }

export async function saveEmailRulesAction(p: EmailRulesPayload): Promise<Result> {
  try {
    if (p.subjectMaxChars < 10 || p.bodyMaxWords < 30) throw new Error("Limits are too small")
    if (!p.footer.toLowerCase().includes("unsubscribe")) throw new Error("The footer must include an unsubscribe option")
    const db = getDb()
    const [row] = await db.select({ id: schema.emailRules.id }).from(schema.emailRules).limit(1)
    await db.update(schema.emailRules).set(p).where(eq(schema.emailRules.id, row.id))
    revalidatePath("/thesis")
    return { ok: true, message: "Email rules saved. New drafts and the checklist use them right away." }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
