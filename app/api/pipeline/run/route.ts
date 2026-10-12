import { NextResponse } from "next/server"
import { PIPELINE_ORDER, runStage } from "@/lib/pipeline/stages"

export const maxDuration = 300

// "Run pipeline now": calls each stage in order, in-process (no cron secret leaves the server).
export async function POST() {
  const results = []
  for (const stage of PIPELINE_ORDER) {
    results.push({ stage, ...(await runStage(stage, "manual")) })
  }
  const summary = results
    .map((r) => `${r.stage}: ${r.status}${r.counts.inserted !== undefined ? ` (+${r.counts.inserted})` : ""}`)
    .join(" · ")
  return NextResponse.json({ ok: results.every((r) => r.status !== "error"), results, message: summary })
}
