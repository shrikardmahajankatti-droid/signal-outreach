import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { scheduleEnded } from "@/lib/pipeline/schedule"
import { PIPELINE_ORDER, STAGES, runStage } from "@/lib/pipeline/stages"

export const maxDuration = 300

// /api/cron/ingest, /api/cron/extract, … : one Vercel Cron per stage (vercel.json, 6:00–6:40 IST).
// Vercel Hobby fires each cron at some point within its scheduled hour, so a pipeline cron first runs
// every earlier stage in order: whichever fires first does the work in the right sequence and the
// rest find nothing pending (every stage is idempotent).
export async function GET(req: Request, { params }: { params: Promise<{ stage: string }> }) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { stage } = await params
  if (!STAGES[stage]) return NextResponse.json({ error: `unknown stage ${stage}` }, { status: 404 })

  const { ended, endDate } = scheduleEnded()
  if (ended) return NextResponse.json({ stage, skipped: `schedule ended on ${endDate} (CRON_END_DATE)` })

  const deadline = Date.now() + 250_000
  const idx = (PIPELINE_ORDER as readonly string[]).indexOf(stage)
  const stages = idx === -1 ? [stage] : PIPELINE_ORDER.slice(0, idx + 1)
  const results = []
  for (const s of stages) {
    results.push({ stage: s, ...(await runStage(s, "cron", deadline)) })
  }
  return NextResponse.json({ stage, results })
}
