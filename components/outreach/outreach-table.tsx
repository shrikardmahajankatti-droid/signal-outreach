"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/signal/empty-state"
import { FitBar } from "@/components/signal/fit-bar"
import { StatusPill, type Status } from "@/components/signal/status-pill"
import { bulkSkipAction } from "@/app/(app)/outreach/actions"
import { OPENER_LABELS, formatUsd, relativeTime } from "@/lib/labels"
import type { OutreachRow, OutreachTab } from "@/lib/outreach-queries"
import { cn } from "@/lib/utils"

const EMPTY: Record<OutreachTab, { title: string; description: string }> = {
  drafts: { title: "No drafts waiting", description: "Run the pipeline to find freshly funded startups. Drafts that pass every check land here." },
  approved: { title: "Nothing approved and waiting", description: "Approved emails send immediately; anything stuck here failed to send." },
  sent: { title: "Nothing sent yet", description: "Approve a draft to send it." },
  skipped: { title: "Nothing skipped", description: "Drafts you skip are kept here with your reason." },
}

export function OutreachTable({ rows, tab }: { rows: OutreachRow[]; tab: OutreachTab }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const allSelected = rows.length > 0 && selected.size === rows.length
  const selectable = tab === "drafts"
  const now = useMemo(() => Date.now(), [])

  function toggle(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function bulkSkip() {
    start(async () => {
      const r = await bulkSkipAction([...selected], reason || "Bulk skipped")
      setMessage(r.ok ? (r.message ?? "Done") : r.error)
      setSelected(new Set())
      setReason("")
      router.refresh()
    })
  }

  if (rows.length === 0) return <EmptyState icon={Mail} {...EMPTY[tab]} />

  return (
    <div>
      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-background px-4 py-2 text-[13px]">
          <span className="font-medium">{selected.size} selected</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Skip reason (optional)" className="h-8 max-w-xs bg-surface text-[13px]" />
          <Button size="sm" variant="outline" onClick={bulkSkip} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}Skip selected
          </Button>
          <span className="text-xs text-text-secondary">Approve each email individually: every send goes through the checklist.</span>
        </div>
      )}
      {message && <p className="border-b border-line px-4 py-2 text-[13px] text-text-secondary">{message}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-text-secondary">
              {selectable && (
                <th className="w-10 px-4 py-2.5">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.draftId)) : new Set())}
                    aria-label="Select all"
                  />
                </th>
              )}
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-4 py-2.5 font-medium">To</th>
              <th className="px-4 py-2.5 font-medium">Round</th>
              <th className="px-4 py-2.5 font-medium">Fit score</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">Days left</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Opener</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr
                key={r.draftId}
                className={cn("cursor-pointer hover:bg-background", selected.has(r.draftId) && "bg-[#F4F7FE]")}
                onClick={() => router.push(`/outreach/${r.draftId}`)}
              >
                {selectable && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.draftId)} onCheckedChange={() => toggle(r.draftId)} aria-label={`Select ${r.company}`} />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link href={`/outreach/${r.draftId}`} className="font-medium hover:text-link" onClick={(e) => e.stopPropagation()}>
                    {r.company}
                  </Link>
                  <div className="mt-0.5 flex gap-1.5 text-[11px] text-text-secondary">
                    {!r.checksPass && r.status === "pending" && (
                      <span className="inline-flex items-center gap-0.5 text-status-maybe">
                        <AlertTriangle className="size-3" />
                        checks failing
                      </span>
                    )}
                  </div>
                </td>
                <td className="max-w-[240px] px-4 py-3">
                  <p className="truncate">{r.toName ?? "Founder"}</p>
                  {r.toEmail ? (
                    <p className="truncate text-[12px] text-text-secondary">{r.toEmail}</p>
                  ) : (
                    <p className="text-[12px] text-status-maybe">email needed</p>
                  )}
                  {r.deliveredTo && r.deliveredTo !== r.toEmail && (
                    <p className="truncate text-[11px] text-text-secondary">delivered to {r.deliveredTo}</p>
                  )}
                  {(r.openedAt || r.clickedAt) && (
                    <p className="text-[11px] text-status-sent">{[r.openedAt && "opened", r.clickedAt && "clicked"].filter(Boolean).join(" · ")}</p>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="capitalize">{r.round}</span>
                  <span className="text-text-secondary"> · {formatUsd(r.amountUsd)}</span>
                </td>
                <td className="px-4 py-3"><FitBar score={r.fitScore} /></td>
                <td className={cn("px-4 py-3 tabular-nums", r.daysLeft !== null && r.daysLeft <= 7 && "font-medium text-status-maybe")}>
                  {r.daysLeft === null ? "—" : `${r.daysLeft}d`}
                </td>
                <td className="px-4 py-3"><StatusPill status={r.status as Status} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-text-secondary">{r.openerSource ? OPENER_LABELS[r.openerSource] : "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-text-secondary">{relativeTime(r.updatedAt, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
