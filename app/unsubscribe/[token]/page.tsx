import { revalidatePath } from "next/cache"
import { Button } from "@/components/ui/button"
import { unsubscribe } from "@/lib/outreach"
import { verifyUnsubscribeToken } from "@/lib/unsubscribe"

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ done?: string }>
}) {
  const { token } = await params
  const { done } = await searchParams
  const id = verifyUnsubscribeToken(token)

  async function confirm() {
    "use server"
    const startupId = verifyUnsubscribeToken(token)
    if (startupId) await unsubscribe(startupId, "unsubscribed")
    revalidatePath(`/unsubscribe/${token}`)
    const { redirect } = await import("next/navigation")
    redirect(`/unsubscribe/${token}?done=1`)
  }

  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-8 text-center shadow-subtle">
      {!id ? (
        <p className="text-sm text-text-secondary">This unsubscribe link isn&apos;t valid.</p>
      ) : done ? (
        <>
          <h2 className="text-lg font-semibold">You&apos;re unsubscribed</h2>
          <p className="mt-2 text-sm text-text-secondary">You won&apos;t receive any more emails from us.</p>
        </>
      ) : (
        <form action={confirm}>
          <h2 className="text-lg font-semibold">Stop these emails?</h2>
          <p className="mt-2 mb-6 text-sm text-text-secondary">We&apos;ll remove you from all follow-ups right away.</p>
          <Button type="submit">Unsubscribe</Button>
        </form>
      )}
    </div>
  )
}
