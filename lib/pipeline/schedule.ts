// Daily schedule guard: crons run through CRON_END_DATE (inclusive, Asia/Kolkata), then no-op.
export function istDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

export function scheduleEnded(now = new Date()): { ended: boolean; endDate: string | null } {
  const endDate = process.env.CRON_END_DATE?.trim() || null
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { ended: false, endDate }
  return { ended: istDate(now) > endDate, endDate }
}
