import {
  Bell, Brain, Database, FileSearch, Filter, Hand, Megaphone, Newspaper, PenLine, Send, type LucideIcon,
} from "lucide-react"
import { PageIntro } from "@/components/signal/page-intro"
import { cn } from "@/lib/utils"

type Node = { step: number; name: string; detail: string; icon: LucideIcon; kind?: "trigger" | "gate" }

const NODES: Node[] = [
  { step: 1, name: "Founder announces a round", detail: "Trigger · outside world", icon: Megaphone, kind: "trigger" },
  { step: 2, name: "Ingest news", detail: "RSS · GNews · NewsData · investor portfolios", icon: Newspaper },
  { step: 3, name: "Extract facts", detail: "Gemini Flash · evidence quotes", icon: Brain },
  { step: 4, name: "Hard gates G1–G5", detail: "Code rules from qualification config", icon: Filter },
  { step: 5, name: "Research", detail: "Jina Reader · Tavily", icon: FileSearch },
  { step: 6, name: "Score & draft", detail: "Live thesis · email rules", icon: PenLine },
  { step: 7, name: "Save & sync CRM", detail: "Neon · HubSpot → Draft ready", icon: Database },
  { step: 8, name: "Morning summary", detail: "Resend → Rohit", icon: Bell },
  { step: 9, name: "Human gate", detail: "Approve · edit · skip", icon: Hand, kind: "gate" },
  { step: 10, name: "Send & follow up", detail: "Resend · webhook · day 3/7/14", icon: Send },
]

export default function PipelinePage() {
  return (
    <div>
      <PageIntro title="Pipeline" description="Every stage of today's run. Click a stage to see its last run, items and errors." />
      <div className="mx-auto flex max-w-xl flex-col items-center">
        {NODES.map((n, i) => (
          <div key={n.step} className="flex w-full flex-col items-center">
            <div
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border bg-surface px-4 py-3 shadow-subtle",
                n.kind === "gate" ? "border-status-maybe/60 bg-[#FFFBF2]" : "border-line",
                n.kind === "trigger" && "border-dashed"
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md",
                  n.kind === "gate" ? "bg-[#FBF3E4] text-status-maybe" : "bg-muted text-foreground"
                )}
              >
                <n.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-text-secondary">Step {n.step}</p>
                <p className="truncate text-sm font-medium">{n.name}</p>
                <p className="truncate text-xs text-text-secondary">{n.detail}</p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-text-secondary">—</span>
            </div>
            {i < NODES.length - 1 && <div className="h-6 w-px bg-line" />}
          </div>
        ))}
      </div>
    </div>
  )
}
