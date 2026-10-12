"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import type { StageKey } from "@/lib/hubspot"
import { setDealStage } from "@/lib/outreach"
import { redraftStartup } from "@/lib/pipeline/score-draft"

type Result = { ok: true; message?: string } | { ok: false; error: string }

async function run(id: number, fn: () => Promise<unknown>, message?: string): Promise<Result> {
  try {
    await fn()
    revalidatePath(`/leads/${id}`)
    revalidatePath("/leads")
    return { ok: true, message }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function feedbackAction(startupId: number, label: "good_fit" | "bad_fit", note: string) {
  return run(startupId, async () => {
    await getDb().insert(schema.feedback).values({ startupId, label, note: note.trim() || null })
    await getDb().insert(schema.events).values({ startupId, type: "feedback", detail: { label, note } })
  }, "Thanks: future scores will use this as an example")
}

export async function verifyLinkedInAction(startupId: number, founderId: number, verified: boolean) {
  return run(startupId, () =>
    getDb()
      .update(schema.founders)
      .set({ linkedinVerified: verified, ...(verified ? { linkedinMatchConfidence: 1 } : {}) })
      .where(eq(schema.founders.id, founderId))
  )
}

export async function setLinkedInUrlAction(startupId: number, founderId: number, url: string) {
  return run(startupId, async () => {
    if (url && !/^https:\/\/([a-z]+\.)?linkedin\.com\/in\//.test(url)) throw new Error("Use a linkedin.com/in/… profile URL")
    await getDb()
      .update(schema.founders)
      .set({ linkedinUrl: url || null, linkedinVerified: Boolean(url), linkedinMatchConfidence: url ? 1 : null })
      .where(eq(schema.founders.id, founderId))
  })
}

// "Draft anyway" for a maybe (Rohit overrides the score); still goes through the validator and the human gate.
export async function draftAnywayAction(startupId: number) {
  return run(startupId, async () => {
    await getDb().update(schema.startups).set({ decision: "accepted", stage: "drafted" }).where(eq(schema.startups.id, startupId))
    await redraftStartup(startupId)
    await getDb().insert(schema.events).values({ startupId, type: "drafted", detail: { manual: true } })
  }, "Draft created: find it in Outreach")
}

export async function stageAction(startupId: number, stage: StageKey) {
  return run(startupId, () => setDealStage(startupId, stage), "Stage updated")
}
