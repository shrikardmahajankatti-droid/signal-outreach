// Step 6: Gemini scores fit against the live thesis (weighted in code); if the score clears
// the threshold, Gemini drafts the email + 3 follow-ups and lib/validateEmail checks every
// rule, asking Gemini to rewrite at most twice.
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getSetting, loadEmailRules, loadQualificationConfig, loadThesis, type EmailRules, type Thesis } from "@/lib/config"
import { generateJson } from "@/lib/gemini"
import {
  buildDraftPrompt,
  buildRewritePrompt,
  draftResponseSchema,
  draftSystem,
  draftZod,
  rewriteResponseSchema,
  rewriteZod,
  type AcceleratorProfile,
  type OpenerCandidate,
} from "@/lib/prompts/draft"
import { FACTORS, SCORE_SYSTEM, buildScorePrompt, scoreResponseSchema, scoreZod, type Factor } from "@/lib/prompts/score"
import type { Facts } from "@/lib/qualification/facts"
import { unsubscribeUrl } from "@/lib/unsubscribe"
import { syncPendingToHubSpot } from "@/lib/outreach"
import { renderFooter, validateEmail, withFooter, type EmailValidation } from "@/lib/validateEmail"
import type { Research } from "./enrich"
import type { StageResult } from "./runs"

const BATCH = 30
const CONCURRENCY = 3
const TIME_BUDGET_MS = 220_000
const MAX_REWRITES = 2

type Cfg = Awaited<ReturnType<typeof loadQualificationConfig>>

// Weighted total from the thesis weights, then the soft-signal adjustments from qualification.md §4b.
export function computeFitScore(
  factorScores: Record<Factor, number>,
  weights: Record<string, number>,
  flags: string[],
  cfg: Pick<Cfg, "penalty_large_team" | "penalty_older_company" | "penalty_multiple_seed" | "bonus_serial_founder">
): { score: number; adjustments: string[] } {
  const totalWeight = FACTORS.reduce((sum, f) => sum + (weights[f] ?? 0), 0) || 1
  let score = FACTORS.reduce((sum, f) => sum + (factorScores[f] ?? 0) * (weights[f] ?? 0), 0) / totalWeight
  const adjustments: string[] = []
  if (flags.includes("large_team")) { score -= cfg.penalty_large_team; adjustments.push(`large_team −${cfg.penalty_large_team}`) }
  if (flags.includes("older_company")) { score -= cfg.penalty_older_company; adjustments.push(`older_company −${cfg.penalty_older_company}`) }
  if (flags.includes("multiple_seed")) { score -= cfg.penalty_multiple_seed; adjustments.push(`multiple_seed −${cfg.penalty_multiple_seed}`) }
  if (flags.includes("serial_founder")) { score += cfg.bonus_serial_founder; adjustments.push(`serial_founder +${cfg.bonus_serial_founder}`) }
  return { score: Math.max(0, Math.min(100, Math.round(score))), adjustments }
}

function pickFounder(facts: Facts, withEmail: string[] = []) {
  // A founder with a publicly listed email beats a title match: the email can actually reach them.
  return (
    facts.founders.find((f) => withEmail.includes(f.name)) ??
    facts.founders.find((f) => /ceo/i.test(f.title ?? "")) ??
    facts.founders.find((f) => /founder/i.test(f.title ?? "")) ??
    facts.founders[0] ??
    null
  )
}

function openerCandidates(facts: Facts, research: Research | null, knownInvestors: string[]): OpenerCandidate[] {
  const out: OpenerCandidate[] = []
  const founderNames = facts.founders.map((f) => f.name.toLowerCase())
  for (const p of research?.founder_posts ?? []) {
    const isPost = /linkedin\.com\/(posts|pulse|feed)/.test(p.url) || founderNames.some((n) => p.text.toLowerCase().includes(n))
    if (isPost) out.push({ type: "founder_post", text: p.text.slice(0, 400), source: p.url })
  }
  for (const q of facts.founder_quotes) out.push({ type: "founder_quote", text: `${q.speaker}: "${q.quote}"`, source: "press coverage of the round" })
  if (facts.what_they_do) out.push({ type: "product_detail", text: facts.what_they_do })
  const shared = facts.investors.filter((i) => knownInvestors.some((k) => i.toLowerCase().includes(k.toLowerCase())))
  for (const s of shared) out.push({ type: "shared_investor", text: `${s} also backs companies in our network` })
  return out.slice(0, 6)
}

async function draftEmail(
  s: typeof schema.startups.$inferSelect,
  facts: Facts,
  research: Research | null,
  fitReasons: string[],
  rules: EmailRules,
  accelerator: AcceleratorProfile,
  knownInvestors: string[]
) {
  const db = getDb()
  const founderRows = await db.select({ name: schema.founders.name, email: schema.founders.email }).from(schema.founders).where(eq(schema.founders.startupId, s.id))
  const founder = pickFounder(facts, founderRows.filter((f) => f.email).map((f) => f.name))
  const openers = openerCandidates(facts, research, knownInvestors)
  const footer = renderFooter(rules.footer, { accelerator_name: accelerator.name, unsubscribe_url: unsubscribeUrl(s.id) })
  const openerFacts = [
    ...facts.founders.map((f) => f.name.split(" ")[0]),
    ...facts.investors.map((i) => i.replace(/\(.*?\)/g, "").trim()),
    ...(facts.what_they_do ? facts.what_they_do.split(/[,.:;]/).map((x) => x.trim()).filter((x) => x.length > 8) : []),
  ]
  const ctx = { companyName: facts.company_name, openerFacts }

  const draft = await generateJson({
    system: draftSystem(rules),
    prompt: buildDraftPrompt({ facts, founder, openers, website: research?.website?.excerpt ?? null, accelerator, fitReasons }),
    responseSchema: draftResponseSchema,
    zod: draftZod,
    temperature: 0.6,
  })

  ctx.openerFacts.push(draft.opener_fact, ...openers.map((o) => o.text))
  let email = { subject: draft.subject.trim(), body: withFooter(draft.body, footer) }
  let result: EmailValidation = validateEmail(email, rules, ctx)
  const history: { attempt: number; failed: string[] }[] = [{ attempt: 0, failed: result.checks.filter((c) => !c.pass).map((c) => c.key) }]
  let attempts = 0
  while (!result.pass && attempts < MAX_REWRITES) {
    attempts++
    const failures = result.checks.filter((c) => !c.pass).map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ""}`)
    const rewrite = await generateJson({
      system: draftSystem(rules),
      prompt: buildRewritePrompt({ subject: email.subject, body: draft.body }, failures),
      responseSchema: rewriteResponseSchema,
      zod: rewriteZod,
      temperature: 0.3,
    })
    draft.body = rewrite.body
    email = { subject: rewrite.subject.trim(), body: withFooter(rewrite.body, footer) }
    result = validateEmail(email, rules, ctx)
    history.push({ attempt: attempts, failed: result.checks.filter((c) => !c.pass).map((c) => c.key) })
  }

  const [founderRow] = founder
    ? await db
        .select({ id: schema.founders.id, email: schema.founders.email })
        .from(schema.founders)
        .where(and(eq(schema.founders.startupId, s.id), eq(schema.founders.name, founder.name)))
    : []

  const [row] = await db
    .insert(schema.drafts)
    .values({
      startupId: s.id,
      founderId: founderRow?.id ?? null,
      toEmail: founderRow?.email ?? null, // never invented: Rohit types it in if unknown
      subject: email.subject,
      body: email.body,
      openerSource: draft.opener_source,
      checks: { pass: result.pass, wordCount: result.wordCount, items: result.checks, openerFact: draft.opener_fact, history },
      rewriteAttempts: attempts,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: schema.drafts.startupId,
      // Only a still-pending draft can be regenerated; approved/sent drafts are never touched.
      set: {
        subject: email.subject,
        body: email.body,
        openerSource: draft.opener_source,
        checks: { pass: result.pass, wordCount: result.wordCount, items: result.checks, openerFact: draft.opener_fact, history },
        rewriteAttempts: attempts,
      },
      setWhere: eq(schema.drafts.status, "pending"),
    })
    .returning({ id: schema.drafts.id })
  if (!row) return { drafted: false, pass: result.pass }

  // Follow-ups are scheduled only once the first email is sent (due_at is set then).
  const fuRows = 
  draft.followups
      .sort((a, b) => a.day - b.day)
      .map((f, i) => ({
        draftId: row.id,
        dayOffset: [3, 7, 14][i] ?? f.day,
        subject: f.subject.trim(),
        body: withFooter(f.body, footer),
        status: "scheduled",
      }))
  for (const f of fuRows) {
    await db
      .insert(schema.followups)
      .values(f)
      .onConflictDoUpdate({
        target: [schema.followups.draftId, schema.followups.dayOffset],
        set: { subject: f.subject, body: f.body },
        setWhere: isNull(schema.followups.sentAt),
      })
  }
  return { drafted: true, pass: result.pass }
}

async function scoreOne(
  s: typeof schema.startups.$inferSelect,
  env: {
    cfg: Cfg
    thesis: Thesis
    rules: EmailRules
    accelerator: AcceleratorProfile
    feedback: { company: string; label: string; note: string | null; sector: string | null }[]
    knownInvestors: string[]
    runId: number | null
  }
): Promise<"accepted" | "maybe" | "rejected" | "skipped"> {
  const db = getDb()
  const facts = s.facts as Facts
  const research = (s.research as Research | null) ?? null

  const scored = await generateJson({
    system: SCORE_SYSTEM,
    prompt: buildScorePrompt({ facts, research: research ? { website: research.website, founder_posts: research.founder_posts.slice(0, 3), employee_band: research.employee_band } : null, thesis: env.thesis, feedback: env.feedback }),
    responseSchema: scoreResponseSchema,
    zod: scoreZod,
  })
  const flags = [...new Set([...s.flags, ...scored.flags])]
  const { score, adjustments } = computeFitScore(scored.factor_scores, env.thesis.weights as Record<string, number>, flags, env.cfg)
  const reasons = [...scored.reasons, ...(adjustments.length ? [`Adjustments: ${adjustments.join(", ")}`] : [])]

  let decision: "accepted" | "maybe" | "rejected" | "skipped" =
    score >= env.thesis.fitThreshold ? "accepted" : score >= env.thesis.maybeThreshold ? "maybe" : "rejected"
  const reasonCodes = decision === "rejected" ? ["REJ_LOW_FIT"] : []

  // G5 again right before drafting: never draft someone already contacted or suppressed.
  if (decision === "accepted") {
    const conds = [s.rootDomain ? eq(schema.contacted.rootDomain, s.rootDomain) : undefined, and(isNull(schema.contacted.rootDomain), eq(schema.contacted.normalizedName, s.normalizedName))]
    const [contacted] = await db.select({ id: schema.contacted.id }).from(schema.contacted).where(or(...conds.filter(Boolean)))
    const [dnc] = s.rootDomain
      ? await db.select({ id: schema.doNotContact.id }).from(schema.doNotContact).where(eq(schema.doNotContact.rootDomain, s.rootDomain))
      : []
    if (contacted || dnc) {
      decision = "skipped"
      reasonCodes.push(dnc ? "SKIP_DO_NOT_CONTACT" : "SKIP_ALREADY_CONTACTED")
    }
  }

  await db
    .update(schema.startups)
    .set({
      fitScore: score,
      fitReasons: reasons,
      flags,
      decision,
      reasonCodes,
      stage: decision === "accepted" ? "scored" : decision === "maybe" ? "scored" : "closed",
      lastError: null,
    })
    .where(eq(schema.startups.id, s.id))
  await db.insert(schema.qualificationLog).values({
    startupId: s.id,
    companyDomain: s.rootDomain,
    decision,
    phase: "fit",
    reasonCodes,
    flags,
    fitScore: score,
    configSnapshot: { weights: env.thesis.weights, fit_threshold: env.thesis.fitThreshold, maybe_threshold: env.thesis.maybeThreshold, factor_scores: scored.factor_scores },
    runId: env.runId,
  })
  await db.insert(schema.events).values({ startupId: s.id, type: "scored", detail: { score, decision, factor_scores: scored.factor_scores } })

  if (decision === "accepted") {
    const { drafted, pass } = await draftEmail(s, facts, research, reasons, env.rules, env.accelerator, env.knownInvestors)
    await db.update(schema.startups).set({ stage: "drafted", dealStage: "draft_ready" }).where(eq(schema.startups.id, s.id))
    if (drafted) await db.insert(schema.events).values({ startupId: s.id, type: "drafted", detail: { checks_pass: pass } })
  }
  return decision
}

export async function runScoreDraft(runId?: number, deadline = Date.now() + TIME_BUDGET_MS): Promise<StageResult> {
  const stopAt = Math.min(Date.now() + TIME_BUDGET_MS, deadline)
  const db = getDb()
  const [cfg, thesis, rules, accelerator, investorRows] = await Promise.all([
    loadQualificationConfig(),
    loadThesis(),
    loadEmailRules(),
    getSetting<AcceleratorProfile>("accelerator_profile"),
    db.select({ name: schema.investors.name }).from(schema.investors),
  ])
  if (!accelerator) throw new Error("accelerator_profile missing: run `npm run setup`")
  const feedbackRows = await db
    .select({ label: schema.feedback.label, note: schema.feedback.note, company: schema.startups.name, facts: schema.startups.facts })
    .from(schema.feedback)
    .innerJoin(schema.startups, eq(schema.startups.id, schema.feedback.startupId))
    .orderBy(desc(schema.feedback.createdAt))
    .limit(10)
  const feedback = feedbackRows.map((f) => ({ company: f.company, label: f.label, note: f.note, sector: (f.facts as Facts).sector }))
  const knownInvestors = investorRows.map((i) => i.name.replace(/ India$/, ""))

  const counts = { scored: 0, accepted: 0, maybe: 0, rejected: 0, skipped: 0, failed: 0, deferred: 0 }
  const errors: StageResult["errors"] = []
  const rows = await db
    .select()
    .from(schema.startups)
    .where(and(inArray(schema.startups.stage, ["enriched"]), eq(schema.startups.decision, "pending")))
    .limit(BATCH)

  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) {
        const s = rows[next++]
        if (Date.now() > stopAt) {
          counts.deferred++
          continue
        }
        try {
          const decision = await scoreOne(s, { cfg, thesis, rules, accelerator, feedback, knownInvestors, runId: runId ?? null })
          counts.scored++
          counts[decision]++
        } catch (err) {
          counts.failed++
          errors.push({ item: s.name, message: (err as Error).message })
          await db.update(schema.startups).set({ lastError: (err as Error).message }).where(eq(schema.startups.id, s.id))
        }
      }
    })
  )
  // Step 7: save is done; push drafted startups to HubSpot at "Draft ready".
  const sync = await syncPendingToHubSpot()
  errors.push(...sync.errors)
  return { counts: { ...counts, hubspot_synced: sync.synced }, errors }
}

// Regenerates the pending draft for one startup (editor "Regenerate", or after prompt changes).
export async function redraftStartup(startupId: number): Promise<{ drafted: boolean; pass: boolean }> {
  const db = getDb()
  const [s] = await db.select().from(schema.startups).where(eq(schema.startups.id, startupId))
  if (!s) throw new Error(`startup ${startupId} not found`)
  const [rules, accelerator, investorRows] = await Promise.all([
    loadEmailRules(),
    getSetting<AcceleratorProfile>("accelerator_profile"),
    db.select({ name: schema.investors.name }).from(schema.investors),
  ])
  if (!accelerator) throw new Error("accelerator_profile missing")
  return draftEmail(
    s,
    s.facts as Facts,
    (s.research as Research | null) ?? null,
    s.fitReasons,
    rules,
    accelerator,
    investorRows.map((i) => i.name.replace(/ India$/, ""))
  )
}
