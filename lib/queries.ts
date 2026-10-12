import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"

export async function pendingDraftCount(): Promise<number> {
  try {
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.drafts)
      .where(eq(schema.drafts.status, "pending"))
    return row?.n ?? 0
  } catch {
    return 0
  }
}

export async function databaseReachable(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}
