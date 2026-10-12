import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { STAGES, runStage } from "@/lib/pipeline/stages"

export const maxDuration = 300

// /api/cron/ingest, /api/cron/extract, … : one Vercel Cron per stage, each idempotent.
export async function GET(req: Request, { params }: { params: Promise<{ stage: string }> }) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { stage } = await params
  if (!STAGES[stage]) return NextResponse.json({ error: `unknown stage ${stage}` }, { status: 404 })
  const result = await runStage(stage, "cron")
  return NextResponse.json({ stage, ...result })
}
