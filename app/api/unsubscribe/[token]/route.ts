import { NextResponse } from "next/server"
import { unsubscribe } from "@/lib/outreach"
import { verifyUnsubscribeToken } from "@/lib/unsubscribe"

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) from mail clients.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = verifyUnsubscribeToken((await params).token)
  if (!id) return NextResponse.json({ error: "invalid link" }, { status: 400 })
  await unsubscribe(id, "unsubscribed")
  return NextResponse.json({ ok: true })
}
