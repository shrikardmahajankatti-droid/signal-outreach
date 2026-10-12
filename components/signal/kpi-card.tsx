import { Card } from "@/components/ui/card"
import { Sparkline } from "./sparkline"

export function KpiCard({
  label,
  value,
  hint,
  series,
}: {
  label: string
  value: string
  hint?: string
  series?: number[]
}) {
  return (
    <Card className="gap-3 px-4">
      <p className="text-[13px] text-text-secondary">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {series && series.length > 1 && <Sparkline data={series} />}
      </div>
      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
    </Card>
  )
}
