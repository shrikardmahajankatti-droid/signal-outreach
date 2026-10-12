import Link from "next/link"
import { Users } from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { EmptyState, ErrorState } from "@/components/signal/empty-state"
import { FitBar } from "@/components/signal/fit-bar"
import { StatusPill, type Status } from "@/components/signal/status-pill"
import { LeadFilters } from "@/components/leads/filters"
import { DECISION_FILTERS, listLeads, type DecisionFilter } from "@/lib/leads-queries"
import { FLAG_LABELS, formatUsd } from "@/lib/labels"

const DECISION_PILL: Record<string, Status> = { accepted: "accepted", maybe: "maybe", rejected: "rejected", skipped: "skipped", pending: "draft" }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ decision?: string; rejected?: string; q?: string }> }) {
  const sp = await searchParams
  const decision: DecisionFilter = DECISION_FILTERS.includes(sp.decision as DecisionFilter) ? (sp.decision as DecisionFilter) : "all"
  const showRejected = sp.rejected === "1" || decision === "rejected"

  let data
  try {
    data = await listLeads({ decision, showRejected, q: sp.q })
  } catch (err) {
    return (
      <div>
        <PageIntro title="Leads" />
        <SectionCard><ErrorState message={(err as Error).message} /></SectionCard>
      </div>
    )
  }

  return (
    <div>
      <PageIntro
        title="Leads"
        description={sp.q ? `Results for “${sp.q}”` : "Every startup the pipeline has evaluated. Rejected ones are hidden unless you ask."}
      />
      <LeadFilters decision={decision} showRejected={showRejected} counts={data.counts} />
      <SectionCard>
        {data.rows.length === 0 ? (
          <EmptyState icon={Users} title="No leads match" description="Try another filter, or run the pipeline." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-text-secondary">
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Decision</th>
                  <th className="px-4 py-2.5 font-medium">Fit</th>
                  <th className="px-4 py-2.5 font-medium">Round</th>
                  <th className="px-4 py-2.5 font-medium">Investors</th>
                  <th className="px-4 py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-background">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${r.id}`} className="font-medium hover:text-link">{r.name}</Link>
                      <p className="text-[12px] text-text-secondary">{r.domain ?? r.sector ?? ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.draftStatus === "sent" ? "sent" : (DECISION_PILL[r.decision] ?? "draft")} />
                    </td>
                    <td className="px-4 py-3"><FitBar score={r.fitScore} /></td>
                    <td className="px-4 py-3 whitespace-nowrap capitalize">
                      {r.round ?? "—"} <span className="text-text-secondary normal-case">· {formatUsd(r.amountUsd)}</span>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-text-secondary">{r.investors.join(", ") || "—"}</td>
                    <td className="max-w-[260px] px-4 py-3 text-[12px] text-text-secondary">
                      {r.decision === "rejected" || r.decision === "skipped"
                        ? r.reasonCodes.join(", ")
                        : r.flags.filter((f) => FLAG_LABELS[f]).map((f) => FLAG_LABELS[f]).join(" · ")}
                      {r.isDemo && <span className="ml-1 rounded bg-muted px-1 text-[11px]">demo</span>}
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
