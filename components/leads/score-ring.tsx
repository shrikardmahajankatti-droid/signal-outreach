export function ScoreRing({ score, size = 72 }: { score: number | null; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const value = score ?? 0
  const color = score === null ? "var(--line)" : score >= 70 ? "var(--status-sent)" : score >= 50 ? "var(--status-maybe)" : "var(--status-rejected)"
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Fit score ${score ?? "not scored"}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none font-semibold tabular-nums">{score ?? "—"}</span>
        <span className="text-[10px] text-text-secondary">fit</span>
      </div>
    </div>
  )
}
