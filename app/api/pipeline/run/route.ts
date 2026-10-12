import { NextResponse } from "next/server"
import { PIPELINE_ORDER, runStage } from "@/lib/pipeline/stages"

export const maxDuration = 300

// "Run pipeline now": calls each stage in order, in-process (no cron secret leaves the server).
export async function POST() {
  // Leave ~40 s of the 300 s function limit for the last in-flight Gemini calls and DB writes.
  const deadline = Date.now() + 250_000
  const results = []
  for (const stage of PIPELINE_ORDER) {
    results.push({ stage, ...(await runStage(stage, "manual", deadline)) })
  }
  const summary = results
    .map((r) => `${r.stage}: ${r.status}${r.counts.inserted !== undefined ? ` (+${r.counts.inserted})` : ""}`)
    .join(" · ")
  const deferred = results.reduce((n, r) => n + (r.counts.deferred ?? 0), 0)
  return NextResponse.json({
    ok: results.every((r) => r.status !== "error"),
    results,
    deferred,
    message: deferred ? `${summary} · ${deferred} left, run again to continue` : summary,
  })
}
