"use client"

import { useState } from "react"
import {
  AlertTriangle, Bell, Brain, Database, ExternalLink, FileSearch, Filter, Hand, Megaphone, Newspaper, PenLine, Send,
  type LucideIcon,
} from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { StageKey, StageOverview } from "@/lib/pipeline/overview"
import { cn } from "@/lib/utils"

type NodeMeta = { step: number; name: string; detail: string; icon: LucideIcon; kind?: "trigger" | "gate" }

const META: Record<StageKey, NodeMeta> = {
  trigger: { step: 1, name: "Founder announces a round", detail: "Trigger · outside world", icon: Megaphone, kind: "trigger" },
  ingest: { step: 2, name: "Ingest news", detail: "RSS · GNews · NewsData · investor portfolios", icon: Newspaper },
  extract: { step: 3, name: "Extract facts", detail: "Gemini Flash · evidence quotes", icon: Brain },
  qualify: { step: 4, name: "Hard gates G1–G5", detail: "Code rules from qualification config", icon: Filter },
  enrich: { step: 5, name: "Research", detail: "Jina Reader · Tavily", icon: FileSearch },
  "score-draft": { step: 6, name: "Score & draft", detail: "Live thesis · email rules", icon: PenLine },
  sync: { step: 7, name: "Save & sync CRM", detail: "Neon · HubSpot → Draft ready", icon: Database },
  summary: { step: 8, name: "Morning summary", detail: "Resend → Rohit", icon: Bell },
  gate: { step: 9, name: "Human gate", detail: "Approve · edit · skip", icon: Hand, kind: "gate" },
  send: { step: 10, name: "Send & follow up", detail: "Resend · webhook · day 3/7/14", icon: Send },
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso))
}

export function PipelineFlow({ stages }: { stages: StageOverview[] }) {
  const [open, setOpen] = useState<StageKey | null>(null)
  const selected = stages.find((s) => s.key === open)
  const meta = open ? META[open] : null

  return (
    <>
      <div className="mx-auto flex max-w-xl flex-col items-center">
        {stages.map((s, i) => {
          const m = META[s.key]
          const hasErrors = (s.lastRun?.errors?.length ?? 0) > 0
          return (
            <div key={s.key} className="flex w-full flex-col items-center">
              <button
                type="button"
                onClick={() => setOpen(s.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-left shadow-subtle transition-colors hover:border-[#C9CBD0] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  m.kind === "gate" ? "border-status-maybe/60 bg-[#FFFBF2]" : "border-line",
                  m.kind === "trigger" && "border-dashed"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-md",
                    m.kind === "gate" ? "bg-[#FBF3E4] text-status-maybe" : "bg-muted text-foreground"
                  )}
                >
                  <m.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-secondary">Step {m.step}</p>
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-text-secondary">{m.detail}</p>
                </div>
                {hasErrors && <AlertTriangle className="size-4 text-status-maybe" aria-label="Last run had errors" />}
                <span className={cn("text-lg font-semibold tabular-nums", s.count === null && "text-text-secondary")}>
                  {s.count ?? "—"}
                </span>
              </button>
              {i < stages.length - 1 && <div className="h-6 w-px bg-line" />}
            </div>
          )
        })}
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && meta && (
            <>
              <SheetHeader>
                <SheetTitle>
                  Step {meta.step}: {meta.name}
                </SheetTitle>
                <SheetDescription>{meta.detail}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6 text-[13px]">
                <section>
                  <h4 className="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">Last run</h4>
                  {selected.lastRun ? (
                    <div className="space-y-2 rounded-md border border-line p-3">
                      <div className="flex justify-between"><span className="text-text-secondary">Started</span><span>{fmt(selected.lastRun.startedAt)}</span></div>
                      <div className="flex justify-between"><span className="text-text-secondary">Status</span><span className="font-medium">{selected.lastRun.status} · {selected.lastRun.trigger}</span></div>
                      {selected.lastRun.counts &&
                        Object.entries(selected.lastRun.counts).map(([k, v]) => (
                          <div key={k} className="flex justify-between"><span className="text-text-secondary">{k.replaceAll("_", " ")}</span><span className="tabular-nums">{v}</span></div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-text-secondary">This stage hasn&apos;t run yet.</p>
                  )}
                </section>

                {(selected.lastRun?.errors?.length ?? 0) > 0 && (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">Errors</h4>
                    <ul className="space-y-1.5">
                      {selected.lastRun!.errors!.map((e, i) => (
                        <li key={i} className="rounded-md bg-[#FBECEC] px-3 py-2 text-status-rejected">
                          {e.item && <span className="font-medium">{e.item}: </span>}
                          {e.message}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h4 className="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">Items</h4>
                  {selected.items.length === 0 ? (
                    <p className="text-text-secondary">No items yet.</p>
                  ) : (
                    <ul className="divide-y divide-line rounded-md border border-line">
                      {selected.items.map((it, i) => (
                        <li key={i} className="flex items-start gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2">{it.title}</p>
                            {it.subtitle && <p className="text-xs text-text-secondary">{it.subtitle}{it.status ? ` · ${it.status}` : ""}</p>}
                          </div>
                          {it.href && (
                            <a href={it.href} target="_blank" rel="noreferrer" className="mt-0.5 text-text-secondary hover:text-link" aria-label="Open source">
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
