"use client"

import { useEffect, useState, useTransition } from "react"
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { checkMailDomainAction, findEmailsAction } from "@/app/(app)/outreach/actions"
import type { DraftDetail } from "@/lib/outreach-queries"
import { cn } from "@/lib/utils"

const KIND_LABEL = { founder: "founder", person: "team member", generic: "company inbox" } as const

function sourceLabel(src: string | null | undefined) {
  if (!src) return null
  if (src === "rohit") return "typed by you"
  try {
    const u = new URL(src)
    return `found on ${u.hostname.replace(/^www\./, "")}${u.pathname !== "/" ? u.pathname : ""}`
  } catch {
    return src
  }
}

export function RecipientField({
  detail,
  value,
  onChange,
  locked,
  demoMode,
  testInbox,
  onRefresh,
}: {
  detail: DraftDetail
  value: string
  onChange: (v: string) => void
  locked: boolean
  demoMode: boolean
  testInbox: string | null
  onRefresh: () => void
}) {
  const { founder, emailCandidates, otherFounders, draft } = detail
  const [mx, setMx] = useState<boolean | null>(draft.toEmailAcceptsMail)
  const [checking, startCheck] = useTransition()
  const [finding, startFind] = useTransition()

  // Re-check the domain's mail server whenever the address changes (debounced).
  useEffect(() => {
    if (!/\S+@\S+\.\S+/.test(value)) {
      setMx(null)
      return
    }
    const t = setTimeout(
      () =>
        startCheck(async () => {
          const r = await checkMailDomainAction(value)
          setMx(r.ok ? (r.data?.accepts ?? null) : null)
        }),
      500
    )
    return () => clearTimeout(t)
  }, [value])

  const source =
    value && founder?.email === value ? sourceLabel(founder.emailSource) : emailCandidates.find((c) => c.email === value) ? sourceLabel(emailCandidates.find((c) => c.email === value)!.source) : value ? "typed by you" : null
  const options = [
    ...otherFounders.filter((f) => f.email).map((f) => ({ email: f.email!, label: `${f.name} (co-founder)`, source: sourceLabel(f.emailSource) })),
    ...emailCandidates.filter((c) => c.email !== value).map((c) => ({ email: c.email, label: c.founder ?? KIND_LABEL[c.kind], source: sourceLabel(c.source) })),
  ].filter((o, i, arr) => arr.findIndex((x) => x.email === o.email) === i && o.email !== value)

  return (
    <div className="space-y-1.5">
      <Label htmlFor="to" className="text-[12px] text-text-secondary">To</Label>
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-md bg-muted px-2 py-1.5 text-[13px]">
          {founder?.name ?? "Founder"}
          {founder?.title && <span className="text-text-secondary">, {founder.title}</span>}
        </span>
        <Input id="to" value={value} onChange={(e) => onChange(e.target.value)} placeholder="email needed: type the founder's address" disabled={locked} className="h-9 text-[13px]" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {value ? (
          <>
            <span className="font-medium text-foreground">{value}</span>
            {source && <span className="text-text-secondary">{source}</span>}
            {checking ? (
              <span className="inline-flex items-center gap-1 text-text-secondary"><Loader2 className="size-3 animate-spin" />checking domain</span>
            ) : mx === true ? (
              <span className="inline-flex items-center gap-1 text-status-sent"><CheckCircle2 className="size-3" />{value.split("@")[1]} accepts mail</span>
            ) : mx === false ? (
              <span className="inline-flex items-center gap-1 text-status-rejected"><XCircle className="size-3" />{value.split("@")[1]} has no mail server</span>
            ) : null}
          </>
        ) : (
          <span className="text-status-maybe">No public address found for {founder?.name ?? "the founder"}: type one, or pick a company inbox below.</span>
        )}
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {options.map((o) => (
            <button
              key={o.email}
              type="button"
              onClick={() => onChange(o.email)}
              className="rounded-md border border-line bg-background px-2 py-1 text-left text-[12px] hover:border-link"
              title={o.source ?? undefined}
            >
              Use <span className="font-medium">{o.email}</span> <span className="text-text-secondary">· {o.label}</span>
            </button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[12px]"
            disabled={finding || !detail.startup.domain}
            title={detail.startup.domain ? undefined : "No company domain known"}
            onClick={() => startFind(async () => { await findEmailsAction(draft.id); onRefresh() })}
          >
            {finding ? <Loader2 className="animate-spin" /> : <Search />}
            {detail.emailsCheckedAt ? "Search again" : "Find public email"}
          </Button>
        </div>
      )}

      <p className={cn("text-[12px]", demoMode ? "text-status-maybe" : "text-text-secondary")}>
        {demoMode
          ? `DEMO MODE: delivered to ${testInbox ?? "the test inbox"}; the banner will show ${value || "“email needed”"} as the intended recipient.`
          : value
            ? `Will be delivered to ${value}.`
            : "Add an address to send."}
      </p>
      {draft.deliveredTo && (
        <p className="text-[12px] text-text-secondary">
          Sent to <span className="font-medium text-foreground">{draft.deliveredTo}</span>
          {draft.deliveredTo !== value && value ? ` (intended: ${value})` : ""}
          {draft.openedAt && ` · opened ${new Date(draft.openedAt).toLocaleString("en-IN")}`}
          {draft.clickedAt && ` · clicked ${new Date(draft.clickedAt).toLocaleString("en-IN")}`}
        </p>
      )}
    </div>
  )
}
