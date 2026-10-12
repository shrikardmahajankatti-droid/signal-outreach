"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, PenLine, ThumbsDown, ThumbsUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { draftAnywayAction, feedbackAction, setLinkedInUrlAction, stageAction, verifyLinkedInAction } from "@/app/(app)/leads/actions"
import type { StageKey } from "@/lib/hubspot"
import { cn } from "@/lib/utils"

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved") : (r.error ?? "Failed") })
      router.refresh()
    })
  return { pending, msg, run }
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return <p className={cn("text-[12px]", msg.ok ? "text-status-sent" : "text-status-rejected")}>{msg.text}</p>
}

export function FeedbackButtons({ startupId, current }: { startupId: number; current: string | null }) {
  const { pending, msg, run } = useAction()
  const [note, setNote] = useState("")
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional, helps future scores)" className="h-8 max-w-xs text-[13px]" />
        <Button size="sm" variant={current === "good_fit" ? "default" : "outline"} disabled={pending} onClick={() => run(() => feedbackAction(startupId, "good_fit", note))}>
          <ThumbsUp /> Good fit
        </Button>
        <Button size="sm" variant={current === "bad_fit" ? "default" : "outline"} disabled={pending} onClick={() => run(() => feedbackAction(startupId, "bad_fit", note))}>
          <ThumbsDown /> Bad fit
        </Button>
      </div>
      <Msg msg={msg} />
    </div>
  )
}

export function DraftAnywayButton({ startupId }: { startupId: number }) {
  const { pending, msg, run } = useAction()
  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => draftAnywayAction(startupId))}>
        {pending ? <Loader2 className="animate-spin" /> : <PenLine />} Draft anyway
      </Button>
      <Msg msg={msg} />
    </div>
  )
}

const STAGE_BUTTONS: { key: StageKey; label: string }[] = [
  { key: "replied", label: "Replied" },
  { key: "meeting_booked", label: "Meeting booked" },
  { key: "applied", label: "Applied" },
  { key: "not_pursued", label: "Not pursued" },
]

export function StageButtons({ startupId }: { startupId: number }) {
  const { pending, msg, run } = useAction()
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {STAGE_BUTTONS.map((s) => (
          <Button key={s.key} size="sm" variant="outline" disabled={pending} onClick={() => run(() => stageAction(startupId, s.key))}>
            {s.label}
          </Button>
        ))}
      </div>
      <p className="text-[12px] text-text-secondary">Moves the HubSpot deal. Replied or later stops follow-ups.</p>
      <Msg msg={msg} />
    </div>
  )
}

export function FounderLinkedIn({
  startupId,
  founderId,
  url,
  verified,
}: {
  startupId: number
  founderId: number
  url: string | null
  verified: boolean
}) {
  const { pending, msg, run } = useAction()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(url ?? "")
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {url && (
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">Verify on LinkedIn</a>
          </Button>
        )}
        {url && !verified && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => verifyLinkedInAction(startupId, founderId, true))}>
            <Check /> It&apos;s them
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>{url ? "Wrong person?" : "Add LinkedIn"}</Button>
      </div>
      {editing && (
        <div className="flex gap-1.5">
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://www.linkedin.com/in/…" className="h-8 text-[13px]" />
          <Button size="sm" disabled={pending} onClick={() => run(() => setLinkedInUrlAction(startupId, founderId, value.trim()))}>Save</Button>
        </div>
      )}
      <Msg msg={msg} />
    </div>
  )
}
