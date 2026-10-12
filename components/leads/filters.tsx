"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const LABELS: Record<string, string> = { all: "All", accepted: "Accepted", maybe: "Maybe", pending: "In pipeline", skipped: "Skipped", rejected: "Rejected" }

export function LeadFilters({ decision, showRejected, counts }: { decision: string; showRejected: boolean; counts: Record<string, number> }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null) next.delete(key)
    else next.set(key, value)
    router.push(`${pathname}?${next.toString()}`)
  }

  const visible = Object.keys(LABELS).filter((k) => k !== "rejected" || showRejected)
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex flex-wrap rounded-lg bg-muted p-1 text-[13px]">
        {visible.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => set("decision", k === "all" ? null : k)}
            className={cn("rounded-md px-3 py-1.5 text-text-secondary", decision === k && "bg-surface font-medium text-foreground shadow-subtle")}
          >
            {LABELS[k]}
            {k !== "all" && <span className="ml-1.5 text-[11px] tabular-nums">{counts[k] ?? 0}</span>}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Switch id="show-rejected" checked={showRejected} onCheckedChange={(v) => set("rejected", v ? "1" : null)} />
        <Label htmlFor="show-rejected" className="text-[13px] text-text-secondary">Show rejected</Label>
      </div>
    </div>
  )
}
