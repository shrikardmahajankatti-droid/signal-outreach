import "server-only"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"

// Typed view of qualification_config. Read fresh from Neon on every run: never cached.
export type QualificationConfig = {
  max_employees: number
  soft_employee_flag: number
  max_company_age_years: number
  max_round_usd: number
  hard_max_round_usd: number
  max_total_raised_usd: number
  max_revenue_usd: number
  allowed_stages: string[]
  fresh_window_hours: number
  late_catch_days: number
  fit_threshold: number
  maybe_threshold: number
  allow_crowdfunding: boolean
  rejected_recheck_days: number
  inr_per_usd: number
  soft_age_years: number
  penalty_large_team: number
  penalty_older_company: number
  penalty_multiple_seed: number
  bonus_serial_founder: number
  small_round_proxy_usd: number
  flag_stages: string[]
  fx_per_usd: Record<string, number>
}

export type Thesis = typeof schema.thesis.$inferSelect
export type EmailRules = typeof schema.emailRules.$inferSelect

export async function loadQualificationConfig(): Promise<QualificationConfig> {
  const rows = await getDb().select().from(schema.qualificationConfig)
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as QualificationConfig
}

export async function loadThesis(): Promise<Thesis> {
  const [row] = await getDb().select().from(schema.thesis).where(eq(schema.thesis.active, true)).limit(1)
  if (!row) throw new Error("No active thesis row. Run `npm run setup`.")
  return row
}

export async function loadEmailRules(): Promise<EmailRules> {
  const [row] = await getDb().select().from(schema.emailRules).limit(1)
  if (!row) throw new Error("No email_rules row. Run `npm run setup`.")
  return row
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await getDb().select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1)
  return (row?.value as T) ?? null
}
