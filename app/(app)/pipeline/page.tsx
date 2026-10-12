import { Newspaper } from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState, ErrorState } from "@/components/signal/empty-state"
import { PipelineFlow } from "@/components/pipeline/flow"
import { getPipelineOverview, getRecentArticles } from "@/lib/pipeline/overview"

function when(d: Date | null) {
  if (!d) return "—"
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d)
}

export default async function PipelinePage() {
  let data
  try {
    const [stages, articles] = await Promise.all([getPipelineOverview(), getRecentArticles(50)])
    data = { stages, articles }
  } catch (err) {
    return (
      <div>
        <PageIntro title="Pipeline" />
        <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <PageIntro title="Pipeline" description="Every stage of today's run. Click a stage to see its last run, items and errors." />
        <PipelineFlow stages={data.stages} />
      </div>

      <SectionCard title="Latest articles" action={<span className="text-xs text-text-secondary">{data.articles.length} most recent</span>}>
        {data.articles.length === 0 ? (
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
                {data.articles.map((a) => (
                  <tr key={a.id} className="hover:bg-background">
                    <td className="max-w-[520px] px-4 py-2.5">
                      <a href={a.url} target="_blank" rel="noreferrer" className="line-clamp-1 hover:text-link">{a.title}</a>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-text-secondary">{a.source}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-text-secondary tabular-nums">{when(a.publishedAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-text-secondary">{a.isDemo ? "demo · " : ""}{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
