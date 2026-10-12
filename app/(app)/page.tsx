import { Activity, Inbox } from "lucide-react"
import { KpiCard } from "@/components/signal/kpi-card"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState } from "@/components/signal/empty-state"

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now))
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

const FUNNEL = [
  { label: "Articles", value: 0 },
  { label: "Funding news", value: 0 },
  { label: "Rejected", value: 0 },
  { label: "Drafts", value: 0 },
]

export default function HomePage() {
  const now = new Date()
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{greeting(now)}, Rohit</h2>
        <p className="mt-1 text-sm text-text-secondary">{date}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Drafts ready" value="0" hint="Waiting for your approval" />
        <KpiCard label="Sent this week" value="0" />
        <KpiCard label="Reply rate" value="—" />
        <KpiCard label="Avg hours, announcement → email" value="—" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Today's run" className="lg:col-span-2" bodyClassName="p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {FUNNEL.map((step, i) => (
              <div key={step.label} className="rounded-md border border-line bg-background p-3">
                <p className="text-xs text-text-secondary">
                  {i + 1}. {step.label}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{step.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-secondary">No run yet today. The pipeline runs daily at 6:00 AM IST.</p>
        </SectionCard>

        <SectionCard title="Recent activity">
          <EmptyState icon={Activity} title="No activity yet" description="Approvals, sends and replies will show up here." />
        </SectionCard>
      </div>

      <SectionCard title="Drafts waiting for you">
        <EmptyState icon={Inbox} title="Nothing to review" description="When the pipeline finds a fit, a ready-to-approve email lands here." />
      </SectionCard>
    </div>
  )
}
