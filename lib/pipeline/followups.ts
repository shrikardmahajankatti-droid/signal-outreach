import { sendDueFollowups } from "@/lib/outreach"
import type { StageResult } from "./runs"

export async function runFollowups(): Promise<StageResult> {
  const r = await sendDueFollowups()
  return { counts: { sent: r.sent, cancelled: r.cancelled, failed: r.failed }, errors: r.errors }
}
