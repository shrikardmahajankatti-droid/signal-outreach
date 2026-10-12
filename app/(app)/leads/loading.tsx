import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { TableSkeleton } from "@/components/signal/table-skeleton"

export default function Loading() {
  return (
    <div>
      <PageIntro title="Leads" description="Every startup the pipeline has evaluated." />
      <SectionCard><TableSkeleton rows={8} cols={6} /></SectionCard>
    </div>
  )
}
