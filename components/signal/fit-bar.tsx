import { cn } from "@/lib/utils"

export function FitBar({ score, className }: { score: number | null; className?: string }) {
  if (score === null) return <span className="text-text-secondary">—</span>
  const color = score >= 70 ? "bg-status-sent" : score >= 50 ? "bg-status-maybe" : "bg-status-rejected"
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-16 rounded-full bg-muted">
        <div className={cn("h-1.5 rounded-full", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="w-6 text-[12px] tabular-nums">{score}</span>
    </div>
  )
}
