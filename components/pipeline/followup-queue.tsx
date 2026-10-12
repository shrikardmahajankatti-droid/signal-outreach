"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Inbox, Loader2, Save, Send, SkipForward, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/signal/empty-state"
import {
  generateFollowupAction, saveFollowupAction, sendFollowupAction, setFollowupsModeAction, skipFollowupAction,
} from "@/app/(app)/pipeline/actions"
import type { QueueItem } from "@/lib/gtm"
import type { EmailRulesInput } from "@/lib/validateEmail"
import { validateEmail } from "@/lib/validateEmail"
import { cn } from "@/lib/utils"

const FU_WORDS = 110

function bucketOf(dueAt: string | null, now: number): "overdue" | "today" | "upcoming" {
  if (!dueAt) return "upcoming"
  const t = new Date(dueAt).getTime()
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  if (t < startOfToday) return "overdue"
  if (t < startOfToday + 86400_000) return "today"
  return "upcoming"
}

function Item({ q, rules, demoMode, now }: { q: QueueItem; rules: EmailRulesInput; demoMode: boolean; now: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(q.subject)
  const [body, setBody] = useState(q.body)
  const [angle, setAngle] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const v = useMemo(() => validateEmail({ subject, body }, { ...rules, bodyMaxWords: FU_WORDS }, { companyName: q.company, openerFacts: [q.company] }), [subject, body, rules, q.company])
  const checks = v.checks.filter((c) => c.key !== "opener_specific" && c.key !== "subject_names_company")
  const pass = checks.every((c) => c.pass)
  const dirty = subject !== q.subject || body !== q.body
  const bucket = bucketOf(q.dueAt, now)

  function act(name: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string; data?: unknown }>, after?: (data: unknown) => void) {
    setBusy(name)
    setMsg(null)
    start(async () => {
      const r = await fn()
      setBusy(null)
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Done") : (r.error ?? "Failed") })
      if (r.ok) after?.(r.data)
      router.refresh()
    })
  }

  return (
    <li className="text-[13px]">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-background" aria-expanded={open}>
        <span
          className={cn(
            "w-[78px] shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-medium",
            bucket === "overdue" ? "bg-[#FBECEC] text-status-rejected" : bucket === "today" ? "bg-[#FBF3E4] text-status-maybe" : "bg-muted text-text-secondary"
          )}
        >
          {bucket === "upcoming" ? (q.dueAt ? new Date(q.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—") : bucket}
        </span>
        <span className="w-14 shrink-0 text-text-secondary">Day {q.day}</span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{q.company}</span>
          <span className="text-text-secondary"> · {q.founder ?? "founder"} · {q.email ?? "email needed"}</span>
          <span className="block truncate text-[12px] text-text-secondary">{q.subject}</span>
        </span>
        {q.edited && <span className="rounded bg-[#EAF1FD] px-1.5 py-0.5 text-[11px] text-status-approved">edited</span>}
        <ChevronDown className={cn("size-4 shrink-0 text-text-secondary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-4 border-t border-line bg-background px-4 py-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-2">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 bg-surface text-[13px]" aria-label="Follow-up subject" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="bg-surface text-[13px] leading-relaxed" aria-label="Follow-up body" />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder="Angle for Generate (optional), e.g. “mention our demo day on 20 Nov”"
                className="h-8 min-w-60 flex-1 bg-surface text-[13px]"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  act("gen", () => generateFollowupAction(q.id, angle), (data) => {
                    const d = data as { subject: string; body: string } | undefined
                    if (d) {
                      setSubject(d.subject)
                      setBody(d.body)
                    }
                  })
                }
              >
                {busy === "gen" ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!pass || busy !== null} onClick={() => act("send", () => sendFollowupAction(q.id, subject, body))}>
                {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send now
              </Button>
              <Button size="sm" variant="outline" disabled={!dirty || busy !== null} onClick={() => act("save", () => saveFollowupAction(q.id, subject, body))}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save
              </Button>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => act("skip", () => skipFollowupAction(q.id))}>
                <SkipForward /> Skip this follow-up
              </Button>
            </div>
            {demoMode && <p className="text-[12px] text-status-maybe">DEMO MODE: goes to the test inbox, threaded as “Re: {q.originalSubject}”.</p>}
            {msg && <p className={cn("text-[12px]", msg.ok ? "text-status-sent" : "text-status-rejected")}>{msg.text}</p>}
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold">Checklist · {v.wordCount}/{FU_WORDS} words</p>
            <ul className="space-y-1 text-[12px]">
              {checks.map((c) => (
                <li key={c.key} className="flex items-start gap-1.5">
                  {c.pass ? <Check className="mt-0.5 size-3 text-status-sent" /> : <X className="mt-0.5 size-3 text-status-rejected" />}
                  <span>{c.label}{!c.pass && c.detail ? `: ${c.detail}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  )
}

export function FollowupQueue({
  queue,
  mode,
  rules,
  demoMode,
}: {
  queue: QueueItem[]
  mode: "manual" | "auto"
  rules: EmailRulesInput
  demoMode: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const now = useMemo(() => Date.now(), [])
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-[12px] text-text-secondary">
          {mode === "manual"
            ? "Follow-ups wait for you: edit, Generate a fresh angle, then Send now. Replies or a HubSpot stage of Replied+ cancel the rest."
            : "Auto: the daily cron sends due follow-ups (still blocked by replies, unsubscribes and Replied+ deal stages)."}
        </p>
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-text-secondary">Auto-send due follow-ups</span>
          <Switch
            checked={mode === "auto"}
            disabled={pending}
            onCheckedChange={(v) => start(async () => { await setFollowupsModeAction(v ? "auto" : "manual"); router.refresh() })}
          />
        </label>
      </div>
      {queue.length === 0 ? (
        <EmptyState icon={Inbox} title="No follow-ups in flight" description="Once you send a first email, its day 3 / 7 / 14 follow-ups appear here." />
      ) : (
        <ul className="divide-y divide-line">
          {queue.map((q) => <Item key={`${q.id}-${q.subject}`} q={q} rules={rules} demoMode={demoMode} now={now} />)}
        </ul>
      )}
    </div>
  )
}
