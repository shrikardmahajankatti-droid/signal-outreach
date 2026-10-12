import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { ErrorState } from "@/components/signal/empty-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { loadEmailRules, loadQualificationConfig, loadThesis } from "@/lib/config"

const usd = (n: number) => `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`

const WEIGHT_LABELS: Record<string, string> = {
  sector: "Sector match",
  geography: "Geography match",
  business_model: "Business model",
  team: "Team signal",
  timing: "Timing / need",
}

export default async function ThesisPage() {
  let data
  try {
    const [cfg, thesis, rules] = await Promise.all([loadQualificationConfig(), loadThesis(), loadEmailRules()])
    data = { cfg, thesis, rules }
  } catch (err) {
    return (
      <div>
        <PageIntro title="Thesis & Rules" />
        <SectionCard>
          <ErrorState message={(err as Error).message} />
        </SectionCard>
      </div>
    )
  }
  const { cfg, thesis, rules } = data

  const conditions: [string, string, string][] = [
    ["Employees", "is at most", String(cfg.max_employees)],
    ["Round stage", "is any of", cfg.allowed_stages.join(", ")],
    ["Round size", "is at most", `${usd(cfg.max_round_usd)} (flag up to ${usd(cfg.hard_max_round_usd)})`],
    ["Total raised", "is at most", usd(cfg.max_total_raised_usd)],
    ["Revenue", "is at most", usd(cfg.max_revenue_usd)],
    ["Company age", "is at most", `${cfg.max_company_age_years} years`],
    ["Announced", "within", `${cfg.fresh_window_hours} hours (late catch ≤ ${cfg.late_catch_days} days)`],
    ["Sector", "is any of", thesis.sectors.join(", ")],
    ["Geography", "is any of", thesis.geographies.join(", ")],
    ["Excluded sector", "is none of", thesis.excludedSectors.join(", ")],
    ["Fit score", "is at least", `${thesis.fitThreshold} (maybe ≥ ${thesis.maybeThreshold})`],
  ]
  const weights = thesis.weights as Record<string, number>

  return (
    <div>
      <PageIntro title="Thesis & Rules" description="Live values from Neon. Edits apply from the next run, with no deploy." />
      <Tabs defaultValue="thesis">
        <TabsList className="mb-4">
          <TabsTrigger value="thesis">Thesis & gates</TabsTrigger>
          <TabsTrigger value="email">Email rules</TabsTrigger>
        </TabsList>
        <TabsContent value="thesis" className="space-y-4">
          <SectionCard title="Conditions" bodyClassName="divide-y divide-line">
            {conditions.map(([field, op, value]) => (
              <div key={field} className="grid grid-cols-1 gap-2 px-4 py-3 text-[13px] sm:grid-cols-[180px_120px_1fr]">
                <span className="font-medium">{field}</span>
                <span className="text-text-secondary">{op}</span>
                <span>{value}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Fit weights" bodyClassName="divide-y divide-line">
            {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-4 px-4 py-3 text-[13px]">
                <span className="w-40 font-medium">{label}</span>
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${weights[key] ?? 0}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums">{weights[key] ?? 0}</span>
              </div>
            ))}
          </SectionCard>
        </TabsContent>
        <TabsContent value="email">
          <SectionCard title="Email rules" bodyClassName="divide-y divide-line text-[13px]">
            <div className="flex justify-between px-4 py-3"><span className="font-medium">Subject length</span><span>under {rules.subjectMaxChars} characters</span></div>
            <div className="flex justify-between px-4 py-3"><span className="font-medium">Body length</span><span>under {rules.bodyMaxWords} words</span></div>
            <div className="px-4 py-3"><p className="font-medium">Banned phrases</p><p className="mt-1 text-text-secondary">{rules.bannedPhrases.join(" · ")}</p></div>
            <div className="px-4 py-3"><p className="font-medium">Spam words</p><p className="mt-1 text-text-secondary">{rules.spamWords.join(" · ")}</p></div>
            <div className="px-4 py-3"><p className="font-medium">Footer</p><pre className="mt-1 font-sans whitespace-pre-wrap text-text-secondary">{rules.footer}</pre></div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}
