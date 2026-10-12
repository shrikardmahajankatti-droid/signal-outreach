// The outreach window: a round can be contacted for `late_catch_days` after its announcement.
export function daysLeftInWindow(announcedOn: string | null, fallback: Date | null, windowDays: number, now = new Date()): number | null {
  const start = announcedOn ? new Date(`${announcedOn}T00:00:00Z`) : fallback
  if (!start || Number.isNaN(start.getTime())) return null
  return Math.max(0, Math.ceil(windowDays - (now.getTime() - start.getTime()) / 86400_000))
}
