import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Ban, Brain, CheckCircle2, Eye, FileSearch, Filter, Hand, Mail, MailCheck, MessageSquare, Newspaper, PenLine, Send,
  ThumbsUp, type LucideIcon, ExternalLink, Info,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SectionCard } from "@/components/signal/section-card"
import { StatusPill, type Status } from "@/components/signal/status-pill"
import { ScoreRing } from "@/components/leads/score-ring"
import { DraftAnywayButton, FeedbackButtons, FounderLinkedIn, StageButtons } from "@/components/leads/lead-actions"
import { getLead } from "@/lib/leads-queries"
import { FLAG_LABELS, formatUsd } from "@/lib/labels"

const EVENT_META: Record<string, { label: string; icon: LucideIcon }> = {
  article_found: { label: "Article found", icon: Newspaper },
  qualified: { label: "Passed hard gates", icon: Filter },
  rejected: { label: "Rejected", icon: Ban },
  skipped: { label: "Skipped", icon: Ban },
  researched: { label: "Researched", icon: FileSearch },
  scored: { label: "Fit scored", icon: Brain },
  drafted: { label: "Email drafted", icon: PenLine },
  hubspot_synced: { label: "Synced to HubSpot", icon: CheckCircle2 },
  approved: { label: "Approved by Rohit", icon: Hand },
  sent: { label: "Email sent", icon: Send },
  email_delivered: { label: "Delivered", icon: MailCheck },
  email_opened: { label: "Opened", icon: Eye },
  email_bounced: { label: "Bounced", icon: Ban },
  email_complained: { label: "Marked as spam", icon: Ban },
  followup_sent: { label: "Follow-up sent", icon: Mail },
  feedback: { label: "Fit feedback", icon: ThumbsUp },
  unsubscribed: { label: "Unsubscribed", icon: Ban },
  stage_replied: { label: "Replied", icon: MessageSquare },
  stage_meeting_booked: { label: "Meeting booked", icon: CheckCircle2 },
  stage_applied: { label: "Applied", icon: CheckCircle2 },
  stage_not_pursued: { label: "Not pursued", icon: Ban },
  hubspot_error: { label: "HubSpot error", icon: Info },
}

function eventDetail(type: string, d: Record<string, unknown> | null): string | null {
  if (!d) return null
  if (type === "article_found") return String(d.url ?? "")
  if (type === "rejected" || type === "skipped") return [...((d.reasonCodes as string[]) ?? []), d.rejectCode, d.reason].filter(Boolean).join(", ")
  if (type === "qualified") return ((d.flags as string[]) ?? []).map((f) => FLAG_LABELS[f] ?? f).join(" · ")
  if (type === "scored") return `score ${d.score} → ${d.decision}`
  if (type === "researched") return [d.domain ? `domain ${d.domain}` : null, `${d.founders} founders`, `${d.posts} public posts`].filter(Boolean).join(" · ")
  if (type === "sent") return `to ${d.deliveredTo}${d.demo ? " (demo)" : ""}`
  if (type === "followup_sent") return `day ${d.day}`
  if (type === "feedback") return `${d.label === "good_fit" ? "👍" : "👎"} ${d.note ?? ""}`
  if (type === "hubspot_error") return String(d.message ?? "")
  return null
}

const when = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(d))

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const lead = await getLead(id)
  if (!lead) notFound()
  const { startup: s, facts, evidence, research, founders, sources, events, draft, feedback } = lead

  const decisionPill: Status = draft?.status === "sent" ? "sent" : (({ accepted: "accepted", maybe: "maybe", rejected: "rejected", skipped: "skipped" } as Record<string, Status>)[s.decision] ?? "draft")

  const properties: [string, string | null, string | undefined][] = [
    ["Domain", s.rootDomain, evidence.company_domain],
    ["Round", facts.round_stage_raw ?? facts.round_stage, evidence.round_stage],
    ["Amount", facts.round_amount_original ? `${facts.round_amount_original.currency} ${facts.round_amount_original.amount.toLocaleString("en-IN")} (${formatUsd(facts.round_amount_usd)})` : null, evidence.round_amount],
    ["Announced", facts.announced_date, evidence.announced_date],
    ["Sector", facts.sector, evidence.sector],
    ["HQ", [facts.hq_city, facts.hq_country].filter(Boolean).join(", ") || null, evidence.hq_country ?? evidence.hq_city],
    ["Founded", facts.founded_year ? String(facts.founded_year) : null, evidence.founded_year],
    ["Employees", facts.employee_count !== null ? String(facts.employee_count) : research?.employee_band ? `${research.employee_band.min}–${research.employee_band.max} (LinkedIn)` : null, evidence.employee_count],
    ["Business model", facts.business_model, evidence.business_model],
    ["Instrument", facts.instrument, evidence.instrument],
    ["Use of funds", facts.use_of_funds, evidence.use_of_funds],
  ]

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-lg border border-line bg-surface p-5 shadow-subtle">
        <div className="flex flex-wrap items-start gap-5">
          <ScoreRing score={s.fitScore} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{s.name}</h2>
              <StatusPill status={decisionPill} />
              {s.isDemo && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-text-secondary">demo</span>}
            </div>
            <p className="mt-1 text-[13px] text-text-secondary">
              <span className="capitalize">{facts.round_stage_raw ?? facts.round_stage ?? "Round"}</span> · {formatUsd(facts.round_amount_usd)}
              {facts.investors.length > 0 && <> · {facts.investors.join(", ")}</>}
            </p>
            {facts.what_they_do && <p className="mt-2 max-w-3xl text-[13px]">{facts.what_they_do}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.reasonCodes.map((c) => <span key={c} className="rounded bg-[#FBECEC] px-1.5 py-0.5 text-[11px] text-status-rejected">{c}</span>)}
              {s.flags.map((f) => <span key={f} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-text-secondary">{FLAG_LABELS[f] ?? f}</span>)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {draft && <Link href={`/outreach/${draft.id}`} className="text-[13px] text-link hover:underline">Open email ({draft.status})</Link>}
            {lead.hubspotUrl && (
              <a href={lead.hubspotUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-link hover:underline">
                Open in HubSpot <ExternalLink className="size-3" />
              </a>
            )}
            {s.decision === "maybe" && !draft && <DraftAnywayButton startupId={s.id} />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Left: properties + founders */}
        <div className="space-y-4">
          <SectionCard title="Properties" bodyClassName="divide-y divide-line text-[13px]">
            {properties.map(([label, value, quote]) => (
              <div key={label} className="grid grid-cols-[120px_1fr] gap-3 px-4 py-2.5">
                <span className="text-text-secondary">{label}</span>
                <span className="flex items-start gap-1.5">
                  <span className={value ? "" : "text-text-secondary"}>{value ?? "unknown"}</span>
                  {quote && (
                    <Tooltip>
                      <TooltipTrigger className="mt-0.5 text-text-secondary hover:text-link" aria-label={`Evidence for ${label}`}>
                        <Info className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">“{quote}”</TooltipContent>
                    </Tooltip>
                  )}
                </span>
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Founders" bodyClassName="divide-y divide-line">
            {founders.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-text-secondary">No founders identified yet.</p>
            ) : (
              founders.map((f) => (
                <div key={f.id} className="space-y-2 px-4 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{f.name}</p>
                      <p className="text-text-secondary">{f.title ?? "Founder"}{f.email ? ` · ${f.email}` : " · email unknown"}</p>
                    </div>
                    <span className="text-[12px] text-text-secondary">
                      {f.linkedinVerified ? "✓ verified" : f.linkedinMatchConfidence !== null ? `${Math.round(f.linkedinMatchConfidence * 100)}% match` : "no profile"}
                    </span>
                  </div>
                  <FounderLinkedIn startupId={s.id} founderId={f.id} url={f.linkedinUrl} verified={f.linkedinVerified} />
                </div>
              ))
            )}
          </SectionCard>

          <SectionCard title="Fit" bodyClassName="space-y-3 p-4 text-[13px]">
            {lead.factorScores && (
              <div className="grid grid-cols-5 gap-2 text-center">
                {Object.entries(lead.factorScores).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-background p-2">
                    <p className="text-[11px] text-text-secondary capitalize">{k.replace("_", " ")}</p>
                    <p className="font-semibold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
            )}
            {s.fitReasons.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4 text-text-secondary">{s.fitReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            ) : (
              <p className="text-text-secondary">Not scored yet.</p>
            )}
            <FeedbackButtons startupId={s.id} current={feedback[0]?.label ?? null} />
          </SectionCard>
        </div>

        {/* Right: timeline + sources */}
        <div className="space-y-4">
          {draft?.status === "sent" && (
            <SectionCard title="Deal stage" bodyClassName="p-4">
              <StageButtons startupId={s.id} />
            </SectionCard>
          )}
          <SectionCard title="Activity" bodyClassName="p-4">
            {events.length === 0 ? (
              <p className="text-[13px] text-text-secondary">No activity yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {events.map((e) => {
                  const meta = EVENT_META[e.type] ?? { label: e.type.replaceAll("_", " "), icon: Info }
                  const detail = eventDetail(e.type, e.detail as Record<string, unknown> | null)
                  return (
                    <li key={e.id} className="text-[13px]">
                      <span className="absolute -left-[9px] flex size-[18px] items-center justify-center rounded-full border border-line bg-surface">
                        <meta.icon className="size-2.5 text-text-secondary" />
                      </span>
                      <p className="font-medium">{meta.label}<span className="ml-2 font-normal text-[12px] text-text-secondary">{when(e.createdAt)}</span></p>
                      {detail && <p className="truncate text-[12px] text-text-secondary">{detail}</p>}
                    </li>
                  )
                })}
              </ol>
            )}
          </SectionCard>
          <SectionCard title={`Sources (${sources.length})`} bodyClassName="divide-y divide-line">
            {sources.map((src) => (
              <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="block px-4 py-2.5 text-[13px] hover:bg-background">
                <p className="line-clamp-1">{src.title}</p>
                <p className="text-[12px] text-text-secondary">{src.source}{src.publishedAt ? ` · ${when(src.publishedAt)}` : ""}</p>
              </a>
            ))}
          </SectionCard>
          {research?.founder_posts?.length ? (
            <SectionCard title="Public posts & quotes" bodyClassName="divide-y divide-line">
              {research.founder_posts.slice(0, 5).map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="block px-4 py-2.5 text-[13px] hover:bg-background">
                  <p className="line-clamp-2">{p.text}</p>
                  <p className="text-[12px] text-text-secondary">{p.source}</p>
                </a>
              ))}
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  )
}
