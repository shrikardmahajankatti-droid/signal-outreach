import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { TableSkeleton } from "@/components/signal/table-skeleton"

export default function Loading() {
  return (
    <div>
      <PageIntro title="Outreach" description="Review, edit and approve drafts. Nothing is sent without your approval." />
      <SectionCard><TableSkeleton rows={6} cols={7} /></SectionCard>
    </div>
  )
}
