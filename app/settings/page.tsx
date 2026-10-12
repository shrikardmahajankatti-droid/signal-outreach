import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { isDemoMode } from "@/lib/env"
import { cn } from "@/lib/utils"

const INTEGRATIONS: { name: string; env: string[] }[] = [
  { name: "Gemini", env: ["GEMINI_API_KEY"] },
  { name: "Neon", env: ["DATABASE_URL"] },
  { name: "Resend", env: ["RESEND_API_KEY"] },
  { name: "HubSpot", env: ["HUBSPOT_ACCESS_TOKEN"] },
  { name: "Tavily", env: ["TAVILY_API_KEY"] },
  { name: "GNews", env: ["GNEWS_API_KEY"] },
  { name: "NewsData.io", env: ["NEWSDATA_API_KEY"] },
]

export default function SettingsPage() {
  const demo = isDemoMode()
  return (
    <div className="space-y-4">
      <PageIntro title="Settings" description="Sources, integrations and demo controls." />
      <SectionCard title="Integrations" bodyClassName="divide-y divide-line">
        {INTEGRATIONS.map((i) => {
          const ok = i.env.every((k) => Boolean(process.env[k]))
          return (
            <div key={i.name} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <span className="font-medium">{i.name}</span>
              <span className="flex items-center gap-2 text-text-secondary">
                <span className={cn("size-2 rounded-full", ok ? "bg-status-sent" : "bg-status-rejected")} />
                {ok ? "Configured" : "Missing key"}
              </span>
            </div>
          )
        })}
      </SectionCard>
      <SectionCard title="Demo mode" bodyClassName="p-4 text-[13px] text-text-secondary">
        Demo mode is <span className="font-medium text-foreground">{demo ? "on" : "off"}</span>.{" "}
        {demo
          ? "Every outgoing email is redirected to the test inbox with a banner naming the real recipient."
          : "Emails go to real founders after approval."}
      </SectionCard>
    </div>
  )
}
