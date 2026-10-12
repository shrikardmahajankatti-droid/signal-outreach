import { Users } from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState } from "@/components/signal/empty-state"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export default function LeadsPage() {
  return (
    <div>
      <PageIntro
        title="Leads"
        description="Every startup the pipeline has evaluated."
        actions={
          <div className="flex items-center gap-2">
            <Switch id="show-rejected" disabled />
            <Label htmlFor="show-rejected" className="text-[13px] text-text-secondary">Show rejected</Label>
          </div>
        }
      />
      <SectionCard>
        <EmptyState icon={Users} title="No leads yet" description="Qualified startups and their founders will be listed here." />
      </SectionCard>
    </div>
  )
}
