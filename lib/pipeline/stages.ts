import { runExtract } from "./extract"
import { runIngest } from "./ingest"
import { runQualify } from "./qualify"
import { withRun, type StageResult, type Trigger } from "./runs"

// Stages in pipeline order. Later phases register enrich, score-draft, summary, followups.
export const STAGES: Record<string, (runId: number) => Promise<StageResult>> = {
  ingest: () => runIngest(),
  extract: (runId) => runExtract(runId),
  qualify: (runId) => runQualify(runId),
}

export const PIPELINE_ORDER = ["ingest", "extract", "qualify"] as const

export async function runStage(stage: string, trigger: Trigger) {
  const fn = STAGES[stage]
  if (!fn) throw new Error(`Unknown stage: ${stage}`)
  return withRun(stage, trigger, fn)
}
