import { Mail } from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState } from "@/components/signal/empty-state"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const COLUMNS = ["Company", "Round", "Fit score", "Days left", "Status", "Opener", "Updated"]

export default function OutreachPage() {
  return (
    <div>
      <PageIntro title="Outreach" description="Review, edit and approve drafts. Nothing is sent without your approval." />
      <Tabs defaultValue="drafts" className="mb-4">
        <TabsList>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
          <TabsTrigger value="skipped">Skipped</TabsTrigger>
        </TabsList>
      </Tabs>
      <SectionCard>
        <div className="hidden grid-cols-7 gap-4 border-b border-line px-4 py-2.5 text-[12px] font-medium text-text-secondary md:grid">
          {COLUMNS.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <EmptyState icon={Mail} title="No drafts yet" description="Run the pipeline to find freshly funded startups and draft emails." />
      </SectionCard>
    </div>
  )
}
