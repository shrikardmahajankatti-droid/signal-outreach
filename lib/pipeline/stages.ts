import { runEnrich } from "./enrich"
import { runExtract } from "./extract"
import { runFollowups } from "./followups"
import { runIngest } from "./ingest"
import { runQualify } from "./qualify"
import { runScoreDraft } from "./score-draft"
import { runSummary } from "./summary"
import { withRun, type StageResult, type Trigger } from "./runs"

// `deadline` (epoch ms) lets one request run several stages inside Vercel's 300 s limit:
// each stage stops starting new work after it, and leftovers are picked up by the next run.
export const STAGES: Record<string, (runId: number, deadline?: number) => Promise<StageResult>> = {
  ingest: () => runIngest(),
  extract: (runId, deadline) => runExtract(runId, deadline),
  qualify: (runId) => runQualify(runId),
  enrich: (_runId, deadline) => runEnrich(deadline),
  "score-draft": (runId, deadline) => runScoreDraft(runId, deadline),
  summary: () => runSummary(),
  followups: () => runFollowups(),
}

// "Run pipeline now" runs steps 2–7. The morning summary (8) and follow-ups (10) run on their own crons.
export const PIPELINE_ORDER = ["ingest", "extract", "qualify", "enrich", "score-draft"] as const

export async function runStage(stage: string, trigger: Trigger, deadline?: number) {
  const fn = STAGES[stage]
  if (!fn) throw new Error(`Unknown stage: ${stage}`)
  return withRun(stage, trigger, (runId) => fn(runId, deadline))
}
