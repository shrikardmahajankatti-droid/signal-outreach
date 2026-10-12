import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { ErrorState } from "@/components/signal/empty-state"
import { getDb, schema } from "@/db"
import { isDemoMode } from "@/lib/env"
import { databaseReachable } from "@/lib/queries"
import { cn } from "@/lib/utils"

const INTEGRATIONS: { name: string; env: string }[] = [
  { name: "Gemini", env: "GEMINI_API_KEY" },
  { name: "Resend", env: "RESEND_API_KEY" },
  { name: "HubSpot", env: "HUBSPOT_ACCESS_TOKEN" },
  { name: "Tavily", env: "TAVILY_API_KEY" },
  { name: "GNews", env: "GNEWS_API_KEY" },
  { name: "NewsData.io", env: "NEWSDATA_API_KEY" },
]

function Dot({ ok }: { ok: boolean }) {
  return <span className={cn("size-2 rounded-full", ok ? "bg-status-sent" : "bg-status-rejected")} />
}

export default async function SettingsPage() {
  const demo = isDemoMode()
  const dbOk = await databaseReachable()
  let lists: { sources: (typeof schema.sources.$inferSelect)[]; investors: (typeof schema.investors.$inferSelect)[] } | null = null
  let listError: string | null = null
  if (dbOk) {
    try {
      const db = getDb()
      const [sources, investors] = await Promise.all([
        db.select().from(schema.sources).orderBy(schema.sources.id),
        db.select().from(schema.investors).orderBy(schema.investors.id),
      ])
      lists = { sources, investors }
    } catch (err) {
      listError = (err as Error).message
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro title="Settings" description="Sources, integrations and demo controls." />
      <SectionCard title="Integrations" bodyClassName="divide-y divide-line">
        <div className="flex items-center justify-between px-4 py-3 text-[13px]">
          <span className="font-medium">Neon</span>
          <span className="flex items-center gap-2 text-text-secondary"><Dot ok={dbOk} />{dbOk ? "Connected" : "Unreachable"}</span>
        </div>
        {INTEGRATIONS.map((i) => {
          const ok = Boolean(process.env[i.env])
          return (
            <div key={i.name} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <span className="font-medium">{i.name}</span>
              <span className="flex items-center gap-2 text-text-secondary"><Dot ok={ok} />{ok ? "Configured" : "Missing key"}</span>
            </div>
          )
        })}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="News sources" bodyClassName="divide-y divide-line">
          {listError && <ErrorState message={listError} />}
          {lists?.sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-text-secondary">{s.url}</p>
              </div>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-text-secondary uppercase">{s.type}</span>
            </div>
          ))}
        </SectionCard>
        <SectionCard title="Investor portfolio pages" bodyClassName="divide-y divide-line">
          {lists?.investors.map((i) => (
            <div key={i.id} className="px-4 py-2.5 text-[13px]">
              <p className="font-medium">{i.name}</p>
              <p className="truncate text-xs text-text-secondary">{i.portfolioUrl}</p>
            </div>
          ))}
        </SectionCard>
      </div>

      <SectionCard title="Demo mode" bodyClassName="p-4 text-[13px] text-text-secondary">
        Demo mode is <span className="font-medium text-foreground">{demo ? "on" : "off"}</span>.{" "}
        {demo
          ? "Every outgoing email is redirected to the test inbox with a banner naming the real recipient."
          : "Emails go to real founders after approval."}
      </SectionCard>
    </div>
  )
}
