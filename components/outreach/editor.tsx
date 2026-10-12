"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Check, ExternalLink, Link2 as Linkedin, Loader2, RefreshCw, Save, Send, SkipForward, Sparkles, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FitBar } from "@/components/signal/fit-bar"
import { StatusPill, type Status } from "@/components/signal/status-pill"
import {
  approveAndSendAction, regenerateDraftAction, rewriteOpenerAction, saveDraftAction, skipDraftAction,
} from "@/app/(app)/outreach/actions"
import { FLAG_LABELS, OPENER_LABELS, formatUsd } from "@/lib/labels"
import type { DraftDetail } from "@/lib/outreach-queries"
import { cn } from "@/lib/utils"
import { validateEmail } from "@/lib/validateEmail"

type Notice = { kind: "ok" | "error"; text: string } | null

export function DraftEditor({ detail, demoMode, testInbox, from }: { detail: DraftDetail; demoMode: boolean; testInbox: string | null; from: string }) {
  const router = useRouter()
  const { draft, startup, founder, followups, rules } = detail
  const locked = draft.status === "sent" || draft.status === "skipped"

  const [to, setTo] = useState(draft.toEmail ?? "")
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState("")
  const [showPost, setShowPost] = useState(false)
  const [post, setPost] = useState("")

  const validation = useMemo(
    () => validateEmail({ subject, body }, rules, { companyName: startup.name, openerFacts: detail.openerFacts }),
    [subject, body, rules, startup.name, detail.openerFacts]
  )
  const dirty = to !== (draft.toEmail ?? "") || subject !== draft.subject || body !== draft.body
  const canSend = validation.pass && (demoMode || /\S+@\S+\.\S+/.test(to))
  const edits = { subject, body, toEmail: to.trim() || null }

  function act(name: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string } & Record<string, unknown>>, after?: () => void) {
    setBusy(name)
    setNotice(null)
    start(async () => {
      const r = await fn()
      setBusy(null)
      if (r.ok) {
        setNotice({ kind: "ok", text: (r.message as string) ?? "Done" })
        after?.()
        router.refresh()
      } else setNotice({ kind: "error", text: r.error ?? "Something went wrong" })
    })
  }

  function send() {
    act("send", async () => {
      const r = await approveAndSendAction(draft.id, edits)
      if (r.ok && r.data) return { ok: true, message: `Sent to ${r.data.deliveredTo}${r.data.demo ? " (DEMO MODE: test inbox)" : ""}` }
      return r
    })
  }

  function rewriteOpener() {
    act("opener", async () => {
      const r = await rewriteOpenerAction(body, post)
      if (r.ok && r.data) {
        setBody(r.data.body)
        setShowPost(false)
        setPost("")
        return { ok: true, message: "Opener rewritten from the post: review it, then save or send" }
      }
      return r
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/outreach" className="rounded-md p-1.5 text-text-secondary hover:bg-accent" aria-label="Back to Outreach">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{startup.name}</h2>
              <StatusPill status={draft.status as Status} />
            </div>
            <p className="text-[13px] text-text-secondary capitalize">
              {startup.round ?? "round"} · {formatUsd(startup.amountUsd)}
              {startup.daysLeft !== null && <span className="normal-case"> · {startup.daysLeft} days left in window</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/leads/${startup.id}`} className="text-[13px] text-link hover:underline">Profile</Link>
          {startup.hubspotUrl && (
            <a href={startup.hubspotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-link hover:underline">
              HubSpot <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>

      {notice && (
        <div className={cn("rounded-md px-3 py-2 text-[13px]", notice.kind === "ok" ? "bg-[#E8F5EE] text-status-sent" : "bg-[#FBECEC] text-status-rejected")} role="status">
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left: editor */}
        <div className="space-y-4 rounded-lg border border-line bg-surface p-4 shadow-subtle">
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-[12px] text-text-secondary">To</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-md bg-muted px-2 py-1.5 text-[13px]">{founder?.name ?? "Founder"}</span>
              <Input
                id="to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="email needed: type the founder's address"
                disabled={locked}
                className="h-9 text-[13px]"
              />
            </div>
            {demoMode && <p className="text-[12px] text-status-maybe">DEMO MODE: sends go to {testInbox ?? "the test inbox"} with a banner naming this recipient.</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="subject" className="text-[12px] text-text-secondary">Subject</Label>
              <span className={cn("text-[12px] tabular-nums", subject.length >= rules.subjectMaxChars ? "text-status-rejected" : "text-text-secondary")}>
                {subject.length}/{rules.subjectMaxChars}
              </span>
            </div>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} className="h-9 text-[13px]" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="body" className="text-[12px] text-text-secondary">Body</Label>
              <span className={cn("text-[12px] tabular-nums", validation.wordCount >= rules.bodyMaxWords ? "text-status-rejected" : "text-text-secondary")}>
                {validation.wordCount}/{rules.bodyMaxWords} words (footer excluded)
              </span>
            </div>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} rows={18} className="text-[13px] leading-relaxed" />
          </div>

          {!locked && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button onClick={send} disabled={!canSend || busy !== null} title={!canSend ? "Pass every check (and add an email outside demo mode)" : undefined}>
                  {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />}
                  Approve & send
                </Button>
                <Button variant="outline" onClick={() => act("save", () => saveDraftAction(draft.id, edits))} disabled={!dirty || busy !== null}>
                  {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                  Save
                </Button>
                <Button variant="outline" onClick={() => setShowSkip((v) => !v)} disabled={busy !== null}>
                  <SkipForward />
                  Skip
                </Button>
                <Button variant="ghost" onClick={() => setShowPost((v) => !v)} disabled={busy !== null}>
                  <Linkedin />
                  Paste a LinkedIn post → rewrite opener
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => act("regen", () => regenerateDraftAction(draft.id), () => window.location.reload())}
                  disabled={busy !== null}
                >
                  {busy === "regen" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Regenerate
                </Button>
              </div>

              {showSkip && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-background p-3">
                  <Input value={skipReason} onChange={(e) => setSkipReason(e.target.value)} placeholder="Why skip? (e.g. portfolio company, not a fit)" className="h-8 flex-1 bg-surface text-[13px]" />
                  <Button size="sm" variant="destructive" onClick={() => act("skip", () => skipDraftAction(draft.id, skipReason), () => router.push("/outreach"))} disabled={busy !== null}>
                    {busy === "skip" && <Loader2 className="animate-spin" />}Skip draft
                  </Button>
                </div>
              )}

              {showPost && (
                <div className="space-y-2 rounded-md border border-line bg-background p-3">
                  <Textarea value={post} onChange={(e) => setPost(e.target.value)} placeholder="Paste the founder's LinkedIn post…" rows={5} className="bg-surface text-[13px]" />
                  <Button size="sm" onClick={rewriteOpener} disabled={busy !== null || post.trim().length < 30}>
                    {busy === "opener" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Rewrite opener
                  </Button>
                </div>
              )}
            </>
          )}
          {draft.status === "skipped" && <p className="text-[13px] text-text-secondary">Skipped: {draft.skipReason}</p>}
        </div>

        {/* Right: preview + checklist + context */}
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface shadow-subtle">
            <div className="space-y-1 border-b border-line px-4 py-3 text-[12px] text-text-secondary">
              <p><span className="inline-block w-14">From</span>{from}</p>
              <p>
                <span className="inline-block w-14">To</span>
                {demoMode ? `${testInbox ?? "test inbox"} (demo)` : to || "—"}
              </p>
              <p className="text-[13px] font-medium text-foreground"><span className="inline-block w-14 font-normal text-text-secondary">Subject</span>{subject}</p>
            </div>
            <div className="px-4 py-4 text-[13px] leading-relaxed whitespace-pre-wrap">
              {demoMode && (
                <p className="mb-3 rounded bg-[#FBF3E4] px-2 py-1 text-[12px] text-status-maybe">
                  [DEMO → would go to: {founder?.name ?? "founder"} {to ? `<${to}>` : "(email needed)"}]
                </p>
              )}
              {body}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4 shadow-subtle">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Pre-send checklist</h3>
              <span className={cn("text-[12px] font-medium", validation.pass ? "text-status-sent" : "text-status-rejected")}>
                {validation.checks.filter((c) => c.pass).length}/{validation.checks.length} passing
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-1.5 text-[13px] sm:grid-cols-2">
              {validation.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2">
                  {c.pass ? <Check className="mt-0.5 size-3.5 shrink-0 text-status-sent" /> : <X className="mt-0.5 size-3.5 shrink-0 text-status-rejected" />}
                  <span>
                    {c.label}
                    {!c.pass && c.detail && <span className="block text-[12px] text-text-secondary">{c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {!demoMode && !to && <p className="mt-3 text-[12px] text-status-rejected">Add the founder&apos;s email to send.</p>}
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-surface p-4 text-[13px] shadow-subtle">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Why Signal picked them</h3>
              <FitBar score={startup.fitScore} />
            </div>
            <ul className="list-disc space-y-1 pl-4 text-text-secondary">
              {startup.fitReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              {draft.openerSource && <span className="rounded bg-[#EAF1FD] px-1.5 py-0.5 text-[11px] text-status-approved">Opener: {OPENER_LABELS[draft.openerSource]}</span>}
              {startup.flags.filter((f) => FLAG_LABELS[f]).map((f) => (
                <span key={f} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-text-secondary">{FLAG_LABELS[f]}</span>
              ))}
            </div>
            {founder?.linkedinUrl && (
              <a href={founder.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                <Linkedin className="size-3.5" /> {founder.name} on LinkedIn ({Math.round((founder.confidence ?? 0) * 100)}% match)
              </a>
            )}
          </div>

          <details className="rounded-lg border border-line bg-surface p-4 text-[13px] shadow-subtle">
            <summary className="cursor-pointer text-sm font-semibold">Follow-ups (day 3 · 7 · 14)</summary>
            <ul className="mt-3 space-y-3">
              {followups.map((f) => (
                <li key={f.id} className="rounded-md border border-line p-3">
                  <p className="mb-1 flex justify-between text-[12px] text-text-secondary">
                    <span>Day {f.day} · {f.subject}</span>
                    <span>{f.sentAt ? "sent" : f.status === "cancelled" ? "cancelled" : f.dueAt ? `due ${new Date(f.dueAt).toLocaleDateString("en-IN")}` : "after send"}</span>
                  </p>
                  <p className="whitespace-pre-wrap">{f.body.split("\n—\n")[0]}</p>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  )
}
