import Link from "next/link"
import { Activity, Inbox } from "lucide-react"
import { KpiCard } from "@/components/signal/kpi-card"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState, ErrorState } from "@/components/signal/empty-state"
import { FitBar } from "@/components/signal/fit-bar"
import { homeKpis, recentActivity, todaysRun } from "@/lib/analytics"
import { listOutreach } from "@/lib/outreach-queries"
import { relativeTime } from "@/lib/labels"

const ACTIVITY_LABELS: Record<string, string> = {
  article_found: "article found",
  qualified: "passed the hard gates",
  rejected: "rejected",
  researched: "researched",
  scored: "fit scored",
  drafted: "email drafted",
  hubspot_synced: "synced to HubSpot",
  approved: "approved",
  sent: "email sent",
  email_delivered: "email delivered",
  email_opened: "email opened",
  followup_sent: "follow-up sent",
  feedback: "fit feedback",
  skipped: "skipped",
  unsubscribed: "unsubscribed",
  stage_replied: "replied",
  stage_meeting_booked: "meeting booked",
  stage_applied: "applied",
}

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now))
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

export default async function HomePage() {
  const now = new Date()
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now)

  let data
  try {
    const [kpis, run, activity, drafts] = await Promise.all([homeKpis(), todaysRun(), recentActivity(12), listOutreach("drafts")])
    data = { kpis, run, activity, drafts: drafts.rows.slice(0, 5) }
  } catch (err) {
    return <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
  }
  const { kpis, run, activity, drafts } = data
  const funnel = [
    { label: "Articles", value: run.articles },
    { label: "Funding news", value: run.funding },
    { label: "Rejected", value: run.rejected },
    { label: "Drafts", value: run.drafts },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{greeting(now)}, Rohit</h2>
        <p className="mt-1 text-sm text-text-secondary">{date}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Drafts ready" value={String(kpis.draftsReady)} hint="Waiting for your approval" series={kpis.sparkDrafts} />
        <KpiCard label="Sent this week" value={String(kpis.sentThisWeek)} series={kpis.sparkSent} />
        <KpiCard label="Reply rate" value={kpis.replyRate === null ? "—" : `${kpis.replyRate}%`} hint={kpis.replyRate === null ? "No emails sent yet" : undefined} series={kpis.sparkReplies} />
        <KpiCard label="Avg hours, announcement → email" value={kpis.avgHours === null ? "—" : `${kpis.avgHours}h`} hint="Speed matters: the window is 30 days" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Today's run" className="lg:col-span-2" bodyClassName="p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {funnel.map((step, i) => (
              <div key={step.label} className="rounded-md border border-line bg-background p-3">
                <p className="text-xs text-text-secondary">{i + 1}. {step.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{step.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-secondary">
            {run.lastRunAt ? `Last stage ran ${relativeTime(run.lastRunAt.toISOString(), now.getTime())}. ` : "No run yet. "}
            Scheduled daily from 6:00 AM IST · <Link href="/pipeline" className="text-link hover:underline">see the pipeline</Link>
          </p>
        </SectionCard>

        <SectionCard title="Recent activity" bodyClassName="max-h-[260px] overflow-y-auto">
          {activity.length === 0 ? (
            <EmptyState icon={Activity} title="No activity yet" description="Approvals, sends and replies will show up here." />
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {activity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-2 px-4 py-2">
                  <span className="min-w-0 truncate">
                    <Link href={`/leads/${a.startupId}`} className="font-medium hover:text-link">{a.name}</Link>{" "}
                    <span className="text-text-secondary">{ACTIVITY_LABELS[a.type] ?? a.type.replaceAll("_", " ")}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-text-secondary">{relativeTime(a.createdAt.toISOString(), now.getTime())}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Drafts waiting for you" action={<Link href="/outreach" className="text-[13px] text-link hover:underline">Open Outreach</Link>}>
        {drafts.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing to review" description="When the pipeline finds a fit, a ready-to-approve email lands here." />
        ) : (
          <ul className="divide-y divide-line text-[13px]">
            {drafts.map((d) => (
              <li key={d.draftId}>
                <Link href={`/outreach/${d.draftId}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-background">
                  <span className="font-medium">{d.company}</span>
                  <span className="flex items-center gap-4 text-text-secondary">
                    <span className="capitalize">{d.round}</span>
                    <span className={d.daysLeft !== null && d.daysLeft <= 7 ? "text-status-maybe" : ""}>{d.daysLeft ?? "—"}d left</span>
                    <FitBar score={d.fitScore} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
