import { sendDueFollowups } from "@/lib/outreach"
import type { StageResult } from "./runs"

export async function runFollowups(): Promise<StageResult> {
  const { refreshStagesFromHubSpot } = await import("@/lib/outreach")
  const stagesChanged = await refreshStagesFromHubSpot().catch(() => 0)
  const r = await sendDueFollowups()
  return { counts: { due: r.due, sent: r.sent, cancelled: r.cancelled, failed: r.failed, stages_changed: stagesChanged, auto: r.mode === "auto" ? 1 : 0 }, errors: r.errors }
}
