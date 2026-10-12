"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { generateJson } from "@/lib/gemini"
import type { StageKey } from "@/lib/hubspot"
import { approveAndSend, saveDraft, setDealStage, skipDraft, type DraftEdits } from "@/lib/outreach"
import { OPENER_SYSTEM, buildOpenerPrompt, openerResponseSchema, openerZod } from "@/lib/prompts/opener"
import { redraftStartup } from "@/lib/pipeline/score-draft"

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    revalidatePath("/outreach", "layout")
    revalidatePath("/", "layout")
    return { ok: true, data, message }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function saveDraftAction(draftId: number, edits: DraftEdits) {
  return run(async () => {
    await saveDraft(draftId, edits)
  }, "Saved")
}

// The human gate: the only path that sends an outreach email.
export async function approveAndSendAction(draftId: number, edits: DraftEdits) {
  return run(async () => {
    const r = await approveAndSend(draftId, edits)
    return { deliveredTo: r.deliveredTo, demo: r.demo }
  })
}

export async function skipDraftAction(draftId: number, reason: string) {
  return run(() => skipDraft(draftId, reason), "Skipped")
}

export async function bulkSkipAction(draftIds: number[], reason: string) {
  return run(async () => {
    for (const id of draftIds) await skipDraft(id, reason)
  }, `Skipped ${draftIds.length}`)
}

export async function regenerateDraftAction(draftId: number) {
  return run(async () => {
    const [d] = await getDb().select({ startupId: schema.drafts.startupId, status: schema.drafts.status }).from(schema.drafts).where(eq(schema.drafts.id, draftId))
    if (!d) throw new Error("Draft not found")
    if (d.status !== "pending") throw new Error("Only pending drafts can be regenerated")
    await redraftStartup(d.startupId)
  }, "Regenerated")
}

// "Paste a LinkedIn post → rewrite opener": returns the new body; Rohit reviews it, then saves.
export async function rewriteOpenerAction(body: string, post: string): Promise<ActionResult<{ body: string }>> {
  try {
    if (post.trim().length < 30) throw new Error("Paste the full post text")
    const idx = body.lastIndexOf("\n—\n")
    const main = idx === -1 ? body : body.slice(0, idx)
    const footer = idx === -1 ? "" : body.slice(idx)
    const r = await generateJson({
      system: OPENER_SYSTEM,
      prompt: buildOpenerPrompt(main.trim(), post),
      responseSchema: openerResponseSchema,
      zod: openerZod,
      temperature: 0.4,
    })
    return { ok: true, data: { body: `${r.body.trim()}\n${footer}` } }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function setStageAction(startupId: number, stage: StageKey) {
  return run(() => setDealStage(startupId, stage), "Stage updated")
}
