"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  addInvestorAction, addSourceAction, resetDemoAction, runStageAction, saveAcceleratorAction, setDemoModeAction,
  setTestInboxAction, toggleInvestorAction, toggleSourceAction,
} from "@/app/(app)/settings/actions"
import type { AcceleratorProfile } from "@/lib/prompts/draft"
import { cn } from "@/lib/utils"

type R = { ok: boolean; message?: string; error?: string }

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (fn: () => Promise<R>, after?: () => void) =>
    start(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved") : (r.error ?? "Failed") })
      if (r.ok) after?.()
      router.refresh()
    })
  return { pending, msg, run }
}

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return <p className={cn("text-[12px]", msg.ok ? "text-status-sent" : "text-status-rejected")}>{msg.text}</p>
}

export function DemoControls({ demo, testInbox, liveAllowed }: { demo: boolean; testInbox: string; liveAllowed: boolean }) {
  const { pending, msg, run } = useRun()
  const [inbox, setInbox] = useState(testInbox)
  return (
    <div className="space-y-4 p-4 text-[13px]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">DEMO MODE</p>
          <p className="text-text-secondary">Redirects every outgoing email to the test inbox with a “[DEMO → would go to: …]” banner.</p>
          {!liveAllowed && <p className="text-[12px] text-text-secondary">Locked on: set ALLOW_LIVE_SEND=true in Vercel to allow real sends.</p>}
        </div>
        <Switch checked={demo} disabled={pending || (demo && !liveAllowed)} onCheckedChange={(v) => run(() => setDemoModeAction(v))} aria-label="Demo mode" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 font-medium">Test inbox</span>
        <Input value={inbox} onChange={(e) => setInbox(e.target.value)} className="h-8 max-w-xs text-[13px]" />
        <Button size="sm" variant="outline" disabled={pending || inbox === testInbox} onClick={() => run(() => setTestInboxAction(inbox))}>Save</Button>
      </div>
      <Msg msg={msg} />
    </div>
  )
}

export function ManualRuns() {
  const { pending, msg, run } = useRun()
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <div className="space-y-3 p-4 text-[13px]">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => runStageAction("summary"))}>
          {pending && <Loader2 className="animate-spin" />}Send morning summary now
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => runStageAction("followups"))}>Send due follow-ups now</Button>
        {!confirmReset ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Reset demo
          </Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => resetDemoAction(), () => setConfirmReset(false))}>
            Confirm: remove demo-only data and reload demo articles
          </Button>
        )}
      </div>
      <p className="text-[12px] text-text-secondary">
        Reset demo removes startups that only demo articles created (live leads stay) and re-loads demo_startups.json; then click “Run pipeline now”.
      </p>
      <Msg msg={msg} />
    </div>
  )
}

export function AcceleratorForm({ profile }: { profile: AcceleratorProfile }) {
  const { pending, msg, run } = useRun()
  const [p, setP] = useState(profile)
  return (
    <div className="space-y-3 p-4 text-[13px]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[12px] text-text-secondary">Accelerator name</span>
          <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} className="h-8 text-[13px]" />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] text-text-secondary">Sender name</span>
          <Input value={p.sender_name} onChange={(e) => setP({ ...p, sender_name: e.target.value })} className="h-8 text-[13px]" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">One-liner</span>
        <Input value={p.one_liner} onChange={(e) => setP({ ...p, one_liner: e.target.value })} className="h-8 text-[13px]" />
      </label>
      <label className="block space-y-1">
        <span className="text-[12px] text-text-secondary">What it offers (one per line)</span>
        <Textarea value={p.offers.join("\n")} onChange={(e) => setP({ ...p, offers: e.target.value.split("\n") })} rows={4} className="text-[13px]" />
      </label>
      <Button size="sm" disabled={pending} onClick={() => run(() => saveAcceleratorAction(p))}>Save profile</Button>
      <Msg msg={msg} />
    </div>
  )
}

type Source = { id: number; name: string; type: string; url: string; active: boolean; lastError: string | null; lastFetchedAt: string | null }
type Investor = { id: number; name: string; portfolioUrl: string; active: boolean; lastError: string | null; companies: number }

export function SourcesList({ sources }: { sources: Source[] }) {
  const { pending, msg, run } = useRun()
  const [name, setName] = useState("")
  const [type, setType] = useState("rss")
  const [url, setUrl] = useState("")
  return (
    <div>
      <ul className="divide-y divide-line">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
            <div className={cn("min-w-0", !s.active && "opacity-50")}>
              <p className="truncate font-medium">{s.name} <span className="ml-1 rounded bg-muted px-1 text-[10px] text-text-secondary uppercase">{s.type}</span></p>
              <p className="truncate text-[12px] text-text-secondary">{s.url}</p>
              {s.lastError && <p className="truncate text-[12px] text-status-rejected">{s.lastError}</p>}
            </div>
            <Switch checked={s.active} disabled={pending} onCheckedChange={(v) => run(() => toggleSourceAction(s.id, v))} aria-label={`${s.name} active`} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-line p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-8 w-36 text-[13px]" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-md border border-line bg-surface px-2 text-[13px]" aria-label="Source type">
          <option value="rss">RSS</option>
          <option value="gnews">GNews query</option>
          <option value="newsdata">NewsData query</option>
        </select>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={type === "rss" ? "Feed URL" : "Search query"} className="h-8 min-w-48 flex-1 text-[13px]" />
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => addSourceAction(name, type, url), () => { setName(""); setUrl("") })}>
          <Plus /> Add
        </Button>
      </div>
      <div className="px-3 pb-3"><Msg msg={msg} /></div>
    </div>
  )
}

export function InvestorsList({ investors }: { investors: Investor[] }) {
  const { pending, msg, run } = useRun()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  return (
    <div>
      <ul className="divide-y divide-line">
        {investors.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
            <div className={cn("min-w-0", !i.active && "opacity-50")}>
              <p className="truncate font-medium">{i.name} <span className="ml-1 text-[12px] font-normal text-text-secondary">{i.companies ? `${i.companies} companies tracked` : "no snapshot yet"}</span></p>
              <p className="truncate text-[12px] text-text-secondary">{i.portfolioUrl}</p>
              {i.lastError && <p className="truncate text-[12px] text-status-rejected">{i.lastError}</p>}
            </div>
            <Switch checked={i.active} disabled={pending} onCheckedChange={(v) => run(() => toggleInvestorAction(i.id, v))} aria-label={`${i.name} active`} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-line p-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Investor" className="h-8 w-40 text-[13px]" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Portfolio page URL" className="h-8 min-w-48 flex-1 text-[13px]" />
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => addInvestorAction(name, url), () => { setName(""); setUrl("") })}>
          <Plus /> Add
        </Button>
      </div>
      <div className="px-3 pb-3"><Msg msg={msg} /></div>
    </div>
  )
}
