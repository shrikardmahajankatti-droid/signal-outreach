// "Would match N of the last 30 days": re-applies the code gates with candidate settings and
// reweights each startup's stored Gemini factor scores with candidate weights. No AI calls.
import { and, desc, eq, gte, inArray } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getSetting, loadQualificationConfig, type QualificationConfig } from "@/lib/config"
import { applyGates } from "@/lib/qualification/gates"
import type { Facts } from "@/lib/qualification/facts"
import { computeFitScore } from "@/lib/pipeline/score-draft"
import type { Factor } from "@/lib/prompts/score"

export type RulesPayload = {
  config: Partial<QualificationConfig>
  thesis: {
    sectors: string[]
    geographies: string[]
    businessModels: string[]
    teamSignals: string[]
    excludedSectors: string[]
    weights: Record<Factor, number>
    fitThreshold: number
    maybeThreshold: number
  }
}

export type PreviewResult = { evaluated: number; passGates: number; wouldDraft: number; wouldMaybe: number; unscored: number; names: string[] }

export async function previewRules(p: RulesPayload): Promise<PreviewResult> {
  const db = getDb()
  const base = await loadQualificationConfig()
  const cfg = { ...base, ...p.config } as QualificationConfig
  const demoRef = await getSetting<string>("demo_reference_date")
  const since = new Date(Date.now() - 30 * 86400_000)
  const rows = await db.select().from(schema.startups).where(gte(schema.startups.createdAt, since))
  const ids = rows.map((r) => r.id)
  const logs = ids.length
    ? await db
        .select({ startupId: schema.qualificationLog.startupId, snap: schema.qualificationLog.configSnapshot })
        .from(schema.qualificationLog)
        .where(and(inArray(schema.qualificationLog.startupId, ids), eq(schema.qualificationLog.phase, "fit")))
        .orderBy(desc(schema.qualificationLog.createdAt))
    : []
  const factorsById = new Map<number, Record<Factor, number>>()
  for (const l of logs) {
    const f = (l.snap as { factor_scores?: Record<Factor, number> } | null)?.factor_scores
    if (l.startupId && f && !factorsById.has(l.startupId)) factorsById.set(l.startupId, f)
  }

  const out: PreviewResult = { evaluated: rows.length, passGates: 0, wouldDraft: 0, wouldMaybe: 0, unscored: 0, names: [] }
  for (const s of rows) {
    const facts = s.facts as Facts
    const gate = applyGates(facts, cfg, {
      now: s.isDemo && demoRef ? new Date(demoRef) : new Date(),
      firstSeenAt: s.createdAt,
      excludedSectors: p.thesis.excludedSectors,
      history: { contacted: false, doNotContact: false, draftExists: false },
    })
    if (gate.decision !== "qualified") continue
    out.passGates++
    const factors = factorsById.get(s.id)
    if (!factors) {
      out.unscored++
      continue
    }
    const { score } = computeFitScore(factors, p.thesis.weights, [...s.flags, ...gate.flags], cfg)
    if (score >= p.thesis.fitThreshold) {
      out.wouldDraft++
      out.names.push(s.name)
    } else if (score >= p.thesis.maybeThreshold) out.wouldMaybe++
  }
  return out
}
