"use server"

import { revalidatePath } from "next/cache"
import { getDb, schema } from "@/db"
import type { StageKey } from "@/lib/hubspot"
import {
  generateFollowup, refreshStagesFromHubSpot, saveFollowup, sendFollowup, setDealStage, skipFollowup, type FollowupsMode,
} from "@/lib/outreach"

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>, message?: string | ((t: T) => string)): Promise<Result<T>> {
  try {
    const data = await fn()
    revalidatePath("/pipeline")
    revalidatePath("/", "layout")
    return { ok: true, data, message: typeof message === "function" ? message(data) : message }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function generateFollowupAction(id: number, angle: string) {
  return run(() => generateFollowup(id, angle), (r) => `Generated a new follow-up (${r.angle})`)
}
export async function saveFollowupAction(id: number, subject: string, body: string) {
  return run(() => saveFollowup(id, { subject, body }), "Saved")
}
// Human gate for follow-ups: sends only when Rohit clicks.
export async function sendFollowupAction(id: number, subject: string, body: string) {
  return run(() => sendFollowup(id, { subject, body }), (r) => `Sent to ${r.deliveredTo}${r.demo ? " (DEMO MODE: test inbox)" : ""}`)
}
export async function skipFollowupAction(id: number) {
  return run(() => skipFollowup(id), "Follow-up skipped")
}
export async function setFollowupsModeAction(mode: FollowupsMode) {
  return run(async () => {
    await getDb().insert(schema.appSettings).values({ key: "followups_mode", value: mode }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value: mode } })
  }, mode === "auto" ? "Due follow-ups will be sent by the daily cron" : "Follow-ups wait for you to review and send")
}
export async function moveDealAction(startupId: number, stage: StageKey) {
  return run(() => setDealStage(startupId, stage), "Deal moved")
}
export async function refreshStagesAction() {
  return run(() => refreshStagesFromHubSpot(), (n) => (n ? `${n} deal${n === 1 ? "" : "s"} updated from HubSpot` : "Already in sync with HubSpot"))
}
