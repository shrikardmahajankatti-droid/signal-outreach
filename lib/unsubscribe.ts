import { createHmac, timingSafeEqual } from "node:crypto"

function secret(): string {
  return process.env.CRON_SECRET || "signal-dev-secret"
}

function sign(startupId: number): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${startupId}`).digest("hex").slice(0, 20)
}

export function unsubscribeUrl(startupId: number): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  return `${base}/unsubscribe/${startupId}.${sign(startupId)}`
}

export function verifyUnsubscribeToken(token: string): number | null {
  const [idPart, sig] = token.split(".")
  const id = Number(idPart)
  if (!Number.isInteger(id) || !sig) return null
  const expected = Buffer.from(sign(id))
  const actual = Buffer.from(sig)
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null
}
