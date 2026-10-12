import { runIngest } from "./ingest"
import { withRun, type StageResult, type Trigger } from "./runs"

// Stages in pipeline order. Later phases register extract, qualify, enrich, score-draft, summary, followups.
export const STAGES: Record<string, () => Promise<StageResult>> = {
  ingest: runIngest,
}

export const PIPELINE_ORDER = ["ingest"] as const

export async function runStage(stage: string, trigger: Trigger) {
  const fn = STAGES[stage]
  if (!fn) throw new Error(`Unknown stage: ${stage}`)
  return withRun(stage, trigger, fn)
}
