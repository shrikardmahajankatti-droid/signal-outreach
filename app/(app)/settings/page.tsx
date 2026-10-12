import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { ErrorState } from "@/components/signal/empty-state"
import { AcceleratorForm, DemoControls, InvestorsList, ManualRuns, SourcesList } from "@/components/settings/controls"
import { getDb, schema } from "@/db"
import { getSetting } from "@/lib/config"
import { getDemoMode, getTestInbox, liveSendAllowed } from "@/lib/env"
import { databaseReachable } from "@/lib/queries"
import type { AcceleratorProfile } from "@/lib/prompts/draft"
import { cn } from "@/lib/utils"

const INTEGRATIONS: { name: string; env: string[]; note?: string }[] = [
  { name: "Gemini", env: ["GEMINI_API_KEY"], note: process.env.GEMINI_MODEL },
  { name: "Resend", env: ["RESEND_API_KEY", "OUTREACH_FROM"] },
  { name: "Resend webhook", env: ["RESEND_WEBHOOK_SECRET"], note: "/api/resend/webhook" },
  { name: "HubSpot", env: ["HUBSPOT_ACCESS_TOKEN"] },
  { name: "Tavily", env: ["TAVILY_API_KEY"] },
  { name: "Hunter.io (founder emails)", env: ["HUNTER_API_KEY"] },
  { name: "GNews", env: ["GNEWS_API_KEY"] },
  { name: "NewsData.io", env: ["NEWSDATA_API_KEY"] },
  { name: "Cron secret", env: ["CRON_SECRET"] },
]

function Dot({ ok }: { ok: boolean }) {
  return <span className={cn("size-2 rounded-full", ok ? "bg-status-sent" : "bg-status-rejected")} />
}

export default async function SettingsPage() {
  const { hunterAccount, hunterBudget } = await import("@/lib/research/hunter")
  const [dbOk, demo, testInbox, hunter, hunterLocal] = await Promise.all([
    databaseReachable(),
    getDemoMode(),
    getTestInbox(),
    hunterAccount().catch(() => null),
    hunterBudget().catch(() => null),
  ])
  let data
  try {
    const db = getDb()
    const [sources, investors, profile] = await Promise.all([
      db.select().from(schema.sources).orderBy(schema.sources.id),
      db.select().from(schema.investors).orderBy(schema.investors.id),
      getSetting<AcceleratorProfile>("accelerator_profile"),
    ])
    data = { sources, investors, profile }
  } catch (err) {
    return (
      <div>
        <PageIntro title="Settings" />
        <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageIntro title="Settings" description="Sources, integrations, demo controls and the accelerator profile used in emails." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Integrations" bodyClassName="divide-y divide-line">
          <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
            <span className="font-medium">Neon</span>
            <span className="flex items-center gap-2 text-text-secondary"><Dot ok={dbOk} />{dbOk ? "Connected" : "Unreachable"}</span>
          </div>
          {INTEGRATIONS.map((i) => {
            const ok = i.env.every((k) => Boolean(process.env[k]))
            return (
              <div key={i.name} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span className="font-medium">
                  {i.name}
                  {i.note && <span className="ml-2 font-normal text-[12px] text-text-secondary">{i.note}</span>}
                  {i.env[0] === "HUNTER_API_KEY" && ok && (
                    <span className="ml-2 font-normal text-[12px] text-text-secondary">
                      {hunter ? `${hunter.plan} plan · ${hunter.searchesLeft ?? "?"} searches, ${hunter.verificationsLeft ?? "?"} verifications left` : ""}
                      {hunterLocal ? ` · Signal cap ${hunterLocal.used}/${hunterLocal.cap} this month` : ""}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-text-secondary"><Dot ok={ok} />{ok ? "Configured" : `Missing ${i.env.filter((k) => !process.env[k]).join(", ")}`}</span>
              </div>
            )
          })}
        </SectionCard>
        <div className="space-y-4">
          <SectionCard title="Demo mode">
            <DemoControls demo={demo} testInbox={testInbox ?? ""} liveAllowed={liveSendAllowed()} />
          </SectionCard>
          <SectionCard title="Manual runs">
            <ManualRuns />
          </SectionCard>
        </div>
      </div>

      {data.profile && (
        <SectionCard title="Accelerator profile (used in every draft)">
          <AcceleratorForm profile={data.profile} />
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="News sources">
          <SourcesList
            sources={data.sources.map((s) => ({ id: s.id, name: s.name, type: s.type, url: s.url, active: s.active, lastError: s.lastError, lastFetchedAt: s.lastFetchedAt?.toISOString() ?? null }))}
          />
        </SectionCard>
        <SectionCard title="Investor portfolio pages">
          <InvestorsList
            investors={data.investors.map((i) => ({
              id: i.id,
              name: i.name,
              portfolioUrl: i.portfolioUrl,
              active: i.active,
              lastError: i.lastError,
              companies: ((i.lastSnapshot as { companies?: string[] } | null)?.companies ?? []).length,
            }))}
          />
        </SectionCard>
      </div>
    </div>
  )
}
