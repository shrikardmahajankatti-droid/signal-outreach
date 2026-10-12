import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"

export type Trigger = "cron" | "manual" | "demo"
export type StageResult = { counts: Record<string, number>; errors: { item?: string; message: string }[] }

// Wraps a stage so every execution leaves a row in `runs` with counts and errors.
export async function withRun(
  stage: string,
  trigger: Trigger,
  fn: (runId: number) => Promise<StageResult>
): Promise<StageResult & { runId: number; status: string }> {
  const db = getDb()
  const [run] = await db.insert(schema.runs).values({ stage, trigger }).returning({ id: schema.runs.id })
  try {
    const result = await fn(run.id)
    const status = result.errors.length === 0 ? "ok" : "partial"
    await db
      .update(schema.runs)
      .set({ status, finishedAt: new Date(), counts: result.counts, errors: result.errors })
      .where(eq(schema.runs.id, run.id))
    return { ...result, runId: run.id, status }
  } catch (err) {
    const errors = [{ message: (err as Error).message }]
    await db
      .update(schema.runs)
      .set({ status: "error", finishedAt: new Date(), errors })
      .where(eq(schema.runs.id, run.id))
    return { counts: {}, errors, runId: run.id, status: "error" }
  }
}
