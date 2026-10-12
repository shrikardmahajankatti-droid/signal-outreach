import { createHmac, timingSafeEqual } from "node:crypto"

// Resend signs webhooks with Svix: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<body>"
// using the base64 secret after "whsec_". Several signatures may be sent ("v1,<sig> v1,<sig>").
export function verifyResendSignature(body: string, headers: Headers, secret: string, toleranceSec = 300): boolean {
  const id = headers.get("svix-id")
  const timestamp = headers.get("svix-timestamp")
  const signatures = headers.get("svix-signature")
  if (!id || !timestamp || !signatures) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest()
  return signatures.split(" ").some((part) => {
    const [, sig] = part.split(",")
    if (!sig) return false
    const actual = Buffer.from(sig, "base64")
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}
