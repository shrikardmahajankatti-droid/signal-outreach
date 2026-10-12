import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { ErrorState } from "@/components/signal/empty-state"
import { ThesisBuilder } from "@/components/thesis/builder"
import { loadEmailRules, loadQualificationConfig, loadThesis } from "@/lib/config"
import type { RulesPayload } from "@/lib/thesis-preview"
import type { Factor } from "@/lib/prompts/score"

export default async function ThesisPage() {
  let data
  try {
    data = await Promise.all([loadQualificationConfig(), loadThesis(), loadEmailRules()])
  } catch (err) {
    return (
      <div>
        <PageIntro title="Thesis & Rules" />
        <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
      </div>
    )
  }
  const [cfg, thesis, rules] = data
  const initial: RulesPayload = {
    config: {
      max_employees: cfg.max_employees,
      max_company_age_years: cfg.max_company_age_years,
      max_round_usd: cfg.max_round_usd,
      hard_max_round_usd: cfg.hard_max_round_usd,
      max_total_raised_usd: cfg.max_total_raised_usd,
      max_revenue_usd: cfg.max_revenue_usd,
      allowed_stages: cfg.allowed_stages,
      fresh_window_hours: cfg.fresh_window_hours,
      late_catch_days: cfg.late_catch_days,
      allow_crowdfunding: cfg.allow_crowdfunding,
      reject_mixed_debt_rounds: cfg.reject_mixed_debt_rounds,
    },
    thesis: {
      sectors: thesis.sectors,
      geographies: thesis.geographies,
      businessModels: thesis.businessModels,
      teamSignals: thesis.teamSignals,
      excludedSectors: thesis.excludedSectors,
      weights: thesis.weights as Record<Factor, number>,
      fitThreshold: thesis.fitThreshold,
      maybeThreshold: thesis.maybeThreshold,
    },
  }
  return (
    <div>
      <PageIntro title="Thesis & Rules" description="Live values from Neon, read fresh on every run. Changing them needs no code change or deploy." />
      <ThesisBuilder
        initial={initial}
        initialEmail={{ subjectMaxChars: rules.subjectMaxChars, bodyMaxWords: rules.bodyMaxWords, bannedPhrases: rules.bannedPhrases, spamWords: rules.spamWords, footer: rules.footer }}
      />
    </div>
  )
}
