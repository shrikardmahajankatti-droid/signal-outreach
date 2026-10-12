import Link from "next/link"
import { Newspaper } from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState, ErrorState } from "@/components/signal/empty-state"
import { PipelineFlow } from "@/components/pipeline/flow"
import { DealBoard } from "@/components/pipeline/deal-board"
import { FollowupQueue } from "@/components/pipeline/followup-queue"
import { loadEmailRules } from "@/lib/config"
import { getDemoMode } from "@/lib/env"
import { getGtmBoard } from "@/lib/gtm"
import { getPipelineOverview, getRecentArticles } from "@/lib/pipeline/overview"
import { cn } from "@/lib/utils"

function when(d: Date | null) {
  if (!d) return "—"
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d)
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 shadow-subtle">
      <p className="text-[12px] text-text-secondary">{label}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold tabular-nums", tone === "good" && "text-status-sent", tone === "warn" && "text-status-maybe")}>{value}</p>
      {hint && <p className="text-[11px] text-text-secondary">{hint}</p>}
    </div>
  )
}

const TABS = [
  { key: "deals", label: "Deals" },
  { key: "automation", label: "Automation" },
] as const

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "automation" ? "automation" : "deals"

  const header = (
    <>
      <PageIntro
        title="Pipeline"
        description={view === "deals" ? "Every company Signal chose, where each conversation stands, and the follow-ups in your hands." : "Every automated stage of today's run. Click a stage for its last run, items and errors."}
      />
      <nav className="mb-4 inline-flex rounded-lg bg-muted p-1 text-[13px]" aria-label="Pipeline view">
        {TABS.map((t) => (
          <Link key={t.key} href={`/pipeline?view=${t.key}`} className={cn("rounded-md px-3 py-1.5 text-text-secondary", view === t.key && "bg-surface font-medium text-foreground shadow-subtle")}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  )

  try {
    if (view === "deals") {
      const [board, rules, demoMode] = await Promise.all([getGtmBoard(), loadEmailRules(), getDemoMode()])
      const m = board.metrics
      return (
        <div className="space-y-6">
          <div>{header}</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Chosen" value={String(m.chosen)} hint="passed rules + fit" />
            <Stat label="Contacted" value={String(m.contacted)} />
            <Stat label="Open rate" value={m.openRate === null ? "—" : `${m.openRate}%`} hint="needs the Resend webhook" />
            <Stat label="In talks" value={String(m.inTalks)} tone={m.inTalks ? "good" : undefined} />
            <Stat label="No response" value={String(m.noResponse)} />
            <Stat label="Response rate" value={m.responseRate === null ? "—" : `${m.responseRate}%`} hint="in talks + applied ÷ contacted" />
            <Stat label="Follow-ups due" value={String(m.followupsDue)} tone={m.followupsDue ? "warn" : undefined} />
          </div>
          <DealBoard cards={board.cards} />
          <SectionCard title={`Follow-up queue (${board.queue.length})`}>
            <FollowupQueue
              queue={board.queue}
              mode={board.mode}
              demoMode={demoMode}
              rules={{ subjectMaxChars: rules.subjectMaxChars, bodyMaxWords: rules.bodyMaxWords, bannedPhrases: rules.bannedPhrases, spamWords: rules.spamWords, footer: rules.footer }}
            />
          </SectionCard>
        </div>
      )
    }

    const [stages, articles] = await Promise.all([getPipelineOverview(), getRecentArticles(50)])
    return (
      <div className="space-y-8">
        <div>
          {header}
          <PipelineFlow stages={stages} />
        </div>
        <SectionCard title="Latest articles" action={<span className="text-xs text-text-secondary">{articles.length} most recent</span>}>
          {articles.length === 0 ? (
            <EmptyState icon={Newspaper} title="No articles yet" description="Click “Run pipeline now” to pull today's funding news." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-text-secondary">
                    <th className="px-4 py-2.5 font-medium">Title</th>
                    <th className="px-4 py-2.5 font-medium">Source</th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Published</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {articles.map((a) => (
                    <tr key={a.id} className="hover:bg-background">
                      <td className="max-w-[520px] px-4 py-2.5">
                        <a href={a.url} target="_blank" rel="noreferrer" className="line-clamp-1 hover:text-link">{a.title}</a>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-text-secondary">{a.source}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-text-secondary tabular-nums">{when(a.publishedAt)}</td>
                      <td className="px-4 py-2.5"><span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-text-secondary">{a.isDemo ? "demo · " : ""}{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    )
  } catch (err) {
    return (
      <div>
        {header}
        <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
      </div>
    )
  }
}
