import { notFound } from "next/navigation"
import { DraftEditor } from "@/components/outreach/editor"
import { getDemoMode, getTestInbox } from "@/lib/env"
import { getDraftDetail } from "@/lib/outreach-queries"

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const [detail, demoMode, testInbox] = await Promise.all([getDraftDetail(id), getDemoMode(), getTestInbox()])
  if (!detail) notFound()
  return <DraftEditor key={`${detail.draft.id}-${detail.draft.status}`} detail={detail} demoMode={demoMode} testInbox={testInbox} from={process.env.OUTREACH_FROM ?? "—"} />
}
