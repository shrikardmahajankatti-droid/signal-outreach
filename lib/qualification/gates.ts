// Hard gates G1–G5 from qualification.md, enforced in code against qualification_config.
// Gemini only supplies the facts; it never decides accept/reject here. Pure: no I/O.
import type { Facts } from "./facts"
import { isLateStage } from "./facts"

export type GateConfig = {
  max_employees: number
  soft_employee_flag: number
  max_company_age_years: number
  soft_age_years: number
  max_round_usd: number
  hard_max_round_usd: number
  max_total_raised_usd: number
  max_revenue_usd: number
  allowed_stages: string[]
  flag_stages: string[]
  fresh_window_hours: number
  late_catch_days: number
  allow_crowdfunding: boolean
  reject_mixed_debt_rounds: boolean
}

export type GateHistory = {
  contacted: boolean
  doNotContact: boolean
  draftExists: boolean
}

export type GateContext = {
  now: Date
  // Earliest published date across the startup's source articles (fallback for announced_date).
  firstSeenAt: Date | null
  excludedSectors: string[]
  history: GateHistory
}

export type GateDecision = "rejected" | "skipped" | "qualified"
export type GateResult = { decision: GateDecision; reasonCodes: string[]; flags: string[] }

const GENERIC_NAME = /^(a |an |the )?(stealth|unnamed|undisclosed|unknown)\b/i

export function applyGates(facts: Facts, cfg: GateConfig, ctx: GateContext): GateResult {
  const reject = new Set<string>()
  const flags = new Set<string>()

  // G1: a funding announcement by an identifiable startup (not a fund, not an exit).
  if (!facts.is_funding_announcement) reject.add("REJ_NOT_FUNDING")
  if (["vc_fund", "accelerator", "incubator"].includes(facts.raiser_type)) reject.add("REJ_FUND_NOT_STARTUP")
  if (facts.is_exit_event) reject.add("REJ_EXIT_EVENT")
  if (!facts.company_name || GENERIC_NAME.test(facts.company_name)) reject.add("REJ_UNIDENTIFIABLE")
  if (!facts.company_domain) flags.add("domain_to_enrich")
  // Name + (domain or founder) is required; research gets a chance to find them before
  // REJ_UNIDENTIFIABLE is applied (see the enrich stage).
  if (!facts.company_domain && facts.founders.length === 0) flags.add("identity_to_enrich")

  // G2: the right round.
  const stage = facts.round_stage
  const allowed = cfg.allowed_stages.map((s) => s.toLowerCase())
  if (isLateStage(stage)) reject.add("REJ_LATE_STAGE")
  else if (stage === null) flags.add("stage_unverified")
  else if (!allowed.includes(stage)) flags.add("stage_unrecognised")
  if (stage && cfg.flag_stages.map((s) => s.toLowerCase()).includes(stage)) flags.add("check_stage")

  const amount = facts.round_amount_usd
  if (amount !== null) {
    if (amount > cfg.hard_max_round_usd) reject.add("REJ_ROUND_TOO_BIG")
    else if (amount > cfg.max_round_usd) flags.add("large_round_check")
  } else {
    flags.add("amount_unverified")
  }

  if (["debt", "grant", "prize"].includes(facts.instrument)) reject.add("REJ_NON_EQUITY")
  if (facts.instrument === "mixed") {
    if (cfg.reject_mixed_debt_rounds) reject.add("REJ_NON_EQUITY")
    else flags.add("part_debt")
  }
  if (facts.instrument === "crowdfunding" && !cfg.allow_crowdfunding) reject.add("REJ_CROWDFUNDING")

  // G3: recent enough.
  const announced = facts.announced_date ? new Date(`${facts.announced_date}T00:00:00Z`) : ctx.firstSeenAt
  if (!announced || Number.isNaN(announced.getTime())) {
    flags.add("date_unverified")
  } else {
    const ageHours = (ctx.now.getTime() - announced.getTime()) / 3600_000
    if (ageHours > cfg.late_catch_days * 24) reject.add("REJ_TOO_OLD_NEWS")
    else if (ageHours > cfg.fresh_window_hours) flags.add("late_catch")
  }

  // G4: a startup, not a mature company. Missing data never rejects; it flags.
  if (facts.employee_count === null) flags.add("size_unverified")
  else if (facts.employee_count > cfg.max_employees) reject.add("REJ_TOO_MANY_EMPLOYEES")
  else if (facts.employee_count > cfg.soft_employee_flag) flags.add("large_team")

  const age = facts.founded_year ? ctx.now.getUTCFullYear() - facts.founded_year : null
  if (age !== null && age > cfg.max_company_age_years) reject.add("REJ_TOO_OLD")
  else if (age !== null && age >= cfg.soft_age_years) flags.add("older_company")

  if (facts.total_raised_usd !== null && facts.total_raised_usd > cfg.max_total_raised_usd) reject.add("REJ_RAISED_TOO_MUCH")
  if (facts.prior_rounds.some((r) => isLateStage(r))) reject.add("REJ_HAS_SERIES_A")
  else if (facts.prior_rounds.some((r) => r === "seed" || r === "seed extension")) flags.add("multiple_seed")
  if (facts.is_public) reject.add("REJ_PUBLIC")
  if (facts.parent_company) reject.add("REJ_SUBSIDIARY")
  if (facts.is_acquired) reject.add("REJ_ACQUIRED")
  if (facts.revenue_usd !== null && facts.revenue_usd > cfg.max_revenue_usd) reject.add("REJ_HIGH_REVENUE")
  if (facts.is_traditional_sme && (age === null || age >= cfg.soft_age_years)) reject.add("REJ_TRADITIONAL_SME")
  if (facts.serial_founder_with_exit) flags.add("serial_founder")

  // Excluded sectors auto-reject (qualification.md §6). Gemini names the matching list item;
  // the code only honours it if that item is still on the live thesis list.
  const excluded = ctx.excludedSectors.map((s) => s.toLowerCase())
  if (facts.excluded_sector_match && excluded.includes(facts.excluded_sector_match.toLowerCase())) {
    reject.add("REJ_EXCLUDED_SECTOR")
  }

  if (reject.size > 0) return { decision: "rejected", reasonCodes: [...reject], flags: [...flags] }

  // G5: already handled?
  const skip: string[] = []
  if (ctx.history.doNotContact) skip.push("SKIP_DO_NOT_CONTACT")
  if (ctx.history.contacted) skip.push("SKIP_ALREADY_CONTACTED")
  if (ctx.history.draftExists) skip.push("SKIP_DRAFT_EXISTS")
  if (skip.length > 0) return { decision: "skipped", reasonCodes: skip, flags: [...flags] }

  return { decision: "qualified", reasonCodes: [], flags: [...flags] }
}
