import { BarChart3 } from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState, ErrorState } from "@/components/signal/empty-state"
import { FunnelBars, OutreachLine, RejectionBars, ReplyRateBars } from "@/components/analytics/charts"
import { funnel, outreachPerDay, replyRateByOpener, topRejectionReasons } from "@/lib/analytics"

export default async function AnalyticsPage() {
  let data
  try {
    const [perDay, stages, openers, rejections] = await Promise.all([outreachPerDay(30), funnel(), replyRateByOpener(), topRejectionReasons()])
    data = { perDay, stages, openers, rejections }
  } catch (err) {
    return (
      <div>
        <PageIntro title="Analytics" />
        <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
      </div>
    )
  }
  const anySent = data.openers.some((o) => o.sent > 0)
  return (
    <div>
      <PageIntro title="Analytics" description="How the engine is performing over the last 30 days." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Outreach per day" bodyClassName="p-4">
          <OutreachLine data={data.perDay} />
        </SectionCard>
        <SectionCard title="Funnel by stage" bodyClassName="p-4">
          <FunnelBars data={data.stages} />
        </SectionCard>
        <SectionCard title="Reply rate by opener type" bodyClassName="p-4">
          {anySent ? <ReplyRateBars data={data.openers} /> : <EmptyState icon={BarChart3} title="No emails sent yet" description="Reply rates appear once you approve and send drafts." />}
        </SectionCard>
        <SectionCard title="Top rejection reasons" bodyClassName="p-4">
          {data.rejections.length ? <RejectionBars data={data.rejections} /> : <EmptyState icon={BarChart3} title="No rejections yet" />}
        </SectionCard>
      </div>
    </div>
  )
}
