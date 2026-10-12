"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock, Eye, Loader2, Mail, MoreHorizontal, MousePointerClick, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FitBar } from "@/components/signal/fit-bar"
import { moveDealAction, refreshStagesAction } from "@/app/(app)/pipeline/actions"
import { COLUMNS, type ColumnKey } from "@/lib/gtm-columns"
import type { DealCard } from "@/lib/gtm"
import type { StageKey } from "@/lib/hubspot"
import { cn } from "@/lib/utils"

const ACCENT: Record<ColumnKey, string> = {
  ready: "bg-[#6B6F76]",
  awaiting: "bg-status-approved",
  followup_due: "bg-status-maybe",
  in_talks: "bg-status-sent",
  no_response: "bg-[#B4B7BD]",
  applied: "bg-status-sent",
  closed: "bg-[#D6D7DA]",
}

function ago(iso: string | null, now: number) {
  if (!iso) return null
  const d = Math.floor((now - new Date(iso).getTime()) / 86400_000)
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`
}
function dueLabel(iso: string | null, now: number) {
  if (!iso) return "after send"
  const d = Math.round((new Date(iso).getTime() - now) / 86400_000)
  if (d < 0) return `overdue ${-d}d`
  if (d === 0) return "due today"
  return `due in ${d}d`
}

const MOVES: { stage: StageKey; label: string }[] = [
  { stage: "replied", label: "Replied" },
  { stage: "meeting_booked", label: "Meeting booked" },
  { stage: "applied", label: "Applied" },
  { stage: "not_pursued", label: "Not pursued" },
]

function Card({ c, now, onMove, busy }: { c: DealCard; now: number; onMove: (s: StageKey) => void; busy: boolean }) {
  const href = c.column === "ready" ? `/outreach/${c.draftId}` : `/leads/${c.startupId}`
  return (
    <div className="group rounded-md border border-line bg-surface p-3 text-[12px] shadow-subtle transition-colors hover:border-[#C9CBD0]">
      <div className="flex items-start justify-between gap-2">
        <Link href={href} className="min-w-0">
          <p className="truncate text-[13px] font-medium hover:text-link">{c.company}</p>
          <p className="truncate text-text-secondary">{c.founder ?? "Founder"}</p>
        </Link>
        {c.sentAt && (
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded p-0.5 text-text-secondary hover:bg-accent" aria-label={`Move ${c.company}`} disabled={busy}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-[12px]">Move deal to</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MOVES.map((m) => (
                <DropdownMenuItem key={m.stage} onSelect={() => onMove(m.stage)} className="text-[13px]">{m.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className={cn("mt-1 truncate", c.email ? "text-foreground" : "text-status-maybe")}>
        <Mail className="mr-1 inline size-3 text-text-secondary" />
        {c.email ?? "email needed"}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <FitBar score={c.fit} />
        <span className="flex items-center gap-1.5 text-text-secondary">
          {c.opened && <Eye className="size-3.5 text-status-sent" aria-label="Opened" />}
          {c.clicked && <MousePointerClick className="size-3.5 text-status-sent" aria-label="Clicked" />}
          {c.touches > 0 && <span title="Emails sent">{c.touches}×</span>}
        </span>
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-text-secondary">
        <Clock className="size-3" />
        {c.column === "ready"
          ? `${c.daysLeft ?? "?"}d left in window`
          : c.column === "followup_due" || c.column === "awaiting"
            ? c.nextFollowup
              ? `Day ${c.nextFollowup.day} ${dueLabel(c.nextFollowup.dueAt, now)} · last touch ${ago(c.lastTouchAt, now)}`
              : `last touch ${ago(c.lastTouchAt, now)}`
            : c.lastTouchAt
              ? `last touch ${ago(c.lastTouchAt, now)}`
              : (c.dealStage ?? "").replace("_", " ")}
      </p>
    </div>
  )
}

export function DealBoard({ cards }: { cards: DealCard[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const now = useMemo(() => Date.now(), [])
  const cols = COLUMNS.filter((c) => showClosed || c.key !== "closed")

  function move(startupId: number, stage: StageKey) {
    start(async () => {
      const r = await moveDealAction(startupId, stage)
      setMsg(r.ok ? (r.message ?? "Moved") : r.error)
      router.refresh()
    })
  }
  function refresh() {
    start(async () => {
      const r = await refreshStagesAction()
      setMsg(r.ok ? (r.message ?? "Synced") : r.error)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-text-secondary">
        <span>{msg ?? "Columns update from sends, follow-ups, replies and HubSpot deal stages."}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide closed" : "Show closed"}</Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync stages from HubSpot
          </Button>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cols.map((col) => {
          const items = cards.filter((c) => c.column === col.key).sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0))
          return (
            <section key={col.key} className="flex w-[230px] shrink-0 flex-col rounded-lg bg-[#F0F0F2] p-2" aria-label={col.label}>
              <header className="mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", ACCENT[col.key])} />
                  <h3 className="text-[13px] font-semibold">{col.label}</h3>
                  <span className="ml-auto rounded-full bg-surface px-1.5 text-[11px] tabular-nums text-text-secondary">{items.length}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-text-secondary">{col.hint}</p>
              </header>
              <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-line px-2 py-4 text-center text-[11px] text-text-secondary">None</p>
                ) : (
                  items.map((c) => <Card key={c.draftId} c={c} now={now} busy={pending} onMove={(s) => move(c.startupId, s)} />)
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
