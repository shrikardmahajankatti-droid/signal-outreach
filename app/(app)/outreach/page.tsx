import Link from "next/link"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { ErrorState } from "@/components/signal/empty-state"
import { OutreachTable } from "@/components/outreach/outreach-table"
import { listOutreach, OUTREACH_TABS, type OutreachTab } from "@/lib/outreach-queries"
import { cn } from "@/lib/utils"

const TAB_LABELS: Record<OutreachTab, string> = { drafts: "Drafts", approved: "Approved", sent: "Sent", skipped: "Skipped" }

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams
  const tab: OutreachTab = raw && raw in OUTREACH_TABS ? (raw as OutreachTab) : "drafts"

  let data
  try {
    data = await listOutreach(tab)
  } catch (err) {
    return (
      <div>
        <PageIntro title="Outreach" />
        <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
      </div>
    )
  }

  return (
    <div>
      <PageIntro title="Outreach" description="Review, edit and approve drafts. Nothing is sent without your approval." />
      <nav className="mb-4 inline-flex rounded-lg bg-muted p-1 text-[13px]" aria-label="Outreach status">
        {(Object.keys(TAB_LABELS) as OutreachTab[]).map((t) => (
          <Link
            key={t}
            href={`/outreach?tab=${t}`}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-text-secondary transition-colors",
              t === tab && "bg-surface font-medium text-foreground shadow-subtle"
            )}
          >
            {TAB_LABELS[t]}
            <span className="rounded-full bg-background px-1.5 text-[11px] tabular-nums">{data.counts[t]}</span>
          </Link>
        ))}
      </nav>
      <SectionCard>
        <OutreachTable rows={data.rows} tab={tab} />
      </SectionCard>
    </div>
  )
}
