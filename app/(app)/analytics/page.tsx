import { BarChart3 } from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState } from "@/components/signal/empty-state"

const CHARTS = ["Outreach per day", "Funnel by stage", "Reply rate by opener type", "Top rejection reasons"]

export default function AnalyticsPage() {
  return (
    <div>
      <PageIntro title="Analytics" description="How the engine is performing over time." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {CHARTS.map((c) => (
          <SectionCard key={c} title={c}>
            <EmptyState icon={BarChart3} title="Not enough data yet" />
          </SectionCard>
        ))}
      </div>
    </div>
  )
}
