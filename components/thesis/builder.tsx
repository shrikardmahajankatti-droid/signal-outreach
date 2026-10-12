"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChipsInput } from "./chips"
import { previewAction, saveEmailRulesAction, saveRulesAction, type EmailRulesPayload } from "@/app/(app)/thesis/actions"
import type { PreviewResult, RulesPayload } from "@/lib/thesis-preview"
import { cn } from "@/lib/utils"

const STAGE_OPTIONS = ["pre-seed", "seed", "angel", "seed extension", "pre-series a", "series a"]
const WEIGHT_LABELS = { sector: "Sector match", geography: "Geography match", business_model: "Business model", team: "Team signal", timing: "Timing / need" } as const

function Row({ field, op, children }: { field: string; op: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 px-4 py-2.5 text-[13px] md:grid-cols-[170px_130px_1fr]">
      <span className="font-medium">{field}</span>
      <span className="rounded-md bg-muted px-2 py-1 text-[12px] text-text-secondary">{op}</span>
      <div>{children}</div>
    </div>
  )
}

function NumberField({ value, onChange, suffix, step = 1 }: { value: number; onChange: (n: number) => void; suffix?: string; step?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Input type="number" value={value} step={step} min={0} onChange={(e) => onChange(Number(e.target.value))} className="h-8 w-36 text-[13px] tabular-nums" />
      {suffix && <span className="text-[12px] text-text-secondary">{suffix}</span>}
    </div>
  )
}

function UsdField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <NumberField value={value / 1_000_000} onChange={(n) => onChange(Math.round(n * 1_000_000))} suffix="million USD" step={0.5} />
}

export function ThesisBuilder({ initial, initialEmail }: { initial: RulesPayload; initialEmail: EmailRulesPayload }) {
  const router = useRouter()
  const [rules, setRules] = useState(initial)
  const [email, setEmail] = useState(initialEmail)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, startPreview] = useTransition()
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const cfg = rules.config
  const th = rules.thesis
  const setCfg = (patch: Partial<RulesPayload["config"]>) => setRules((r) => ({ ...r, config: { ...r.config, ...patch } }))
  const setTh = (patch: Partial<RulesPayload["thesis"]>) => setRules((r) => ({ ...r, thesis: { ...r.thesis, ...patch } }))
  const weightTotal = useMemo(() => Object.values(th.weights).reduce((a, b) => a + b, 0), [th.weights])
  const dirty = JSON.stringify(rules) !== JSON.stringify(initial)

  // Live preview, debounced.
  useEffect(() => {
    const t = setTimeout(() => {
      startPreview(async () => {
        const r = await previewAction(rules)
        if (r.ok && r.data) setPreview(r.data)
      })
    }, 400)
    return () => clearTimeout(t)
  }, [rules])

  function save() {
    setMsg(null)
    startSave(async () => {
      const r = await saveRulesAction(rules)
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved") : r.error })
      if (r.ok) router.refresh()
    })
  }
  function saveEmail() {
    setMsg(null)
    startSave(async () => {
      const r = await saveEmailRulesAction(email)
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved") : r.error })
      if (r.ok) router.refresh()
    })
  }

  return (
    <Tabs defaultValue="thesis">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="thesis">Thesis & gates</TabsTrigger>
          <TabsTrigger value="email">Email rules</TabsTrigger>
        </TabsList>
        {msg && <p className={cn("text-[13px]", msg.ok ? "text-status-sent" : "text-status-rejected")}>{msg.text}</p>}
      </div>

      <TabsContent value="thesis" className="space-y-4">
        <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-subtle">
          <div className="text-[13px]">
            {preview ? (
              <>
                Would draft <span className="font-semibold tabular-nums">{preview.wouldDraft}</span> of the last 30 days&apos;{" "}
                <span className="tabular-nums">{preview.evaluated}</span> startups
                <span className="text-text-secondary">
                  {" "}· {preview.passGates} pass the gates · {preview.wouldMaybe} maybe{preview.unscored ? ` · ${preview.unscored} not scored yet` : ""}
                </span>
              </>
            ) : (
              <span className="text-text-secondary">Calculating preview…</span>
            )}
            {previewing && <Loader2 className="ml-2 inline size-3.5 animate-spin text-text-secondary" />}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-text-secondary">Applies from the next run</span>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface shadow-subtle">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">Hard gates (code)</h3>
          <div className="divide-y divide-line">
            <Row field="Employees" op="is less than"><NumberField value={cfg.max_employees ?? 0} onChange={(n) => setCfg({ max_employees: n })} /></Row>
            <Row field="Round stage" op="is any of">
              <div className="flex flex-wrap gap-1.5">
                {STAGE_OPTIONS.map((s) => {
                  const on = cfg.allowed_stages?.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCfg({ allowed_stages: on ? cfg.allowed_stages!.filter((x) => x !== s) : [...(cfg.allowed_stages ?? []), s] })}
                      className={cn("rounded-md border px-2 py-1 text-[12px]", on ? "border-primary bg-primary text-primary-foreground" : "border-line text-text-secondary")}
                      aria-pressed={on}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </Row>
            <Row field="Round size" op="is at most"><UsdField value={cfg.max_round_usd ?? 0} onChange={(n) => setCfg({ max_round_usd: n })} /></Row>
            <Row field="Round size (hard)" op="rejects above"><UsdField value={cfg.hard_max_round_usd ?? 0} onChange={(n) => setCfg({ hard_max_round_usd: n })} /></Row>
            <Row field="Total raised" op="is at most"><UsdField value={cfg.max_total_raised_usd ?? 0} onChange={(n) => setCfg({ max_total_raised_usd: n })} /></Row>
            <Row field="Revenue" op="is at most"><UsdField value={cfg.max_revenue_usd ?? 0} onChange={(n) => setCfg({ max_revenue_usd: n })} /></Row>
            <Row field="Company age" op="is at most"><NumberField value={cfg.max_company_age_years ?? 0} onChange={(n) => setCfg({ max_company_age_years: n })} suffix="years" /></Row>
            <Row field="Announced" op="within"><NumberField value={cfg.fresh_window_hours ?? 0} onChange={(n) => setCfg({ fresh_window_hours: n })} suffix="hours (fresh)" /></Row>
            <Row field="Late catch" op="within"><NumberField value={cfg.late_catch_days ?? 0} onChange={(n) => setCfg({ late_catch_days: n })} suffix="days" /></Row>
            <Row field="Crowdfunding" op="is allowed"><Switch checked={!!cfg.allow_crowdfunding} onCheckedChange={(v) => setCfg({ allow_crowdfunding: v })} /></Row>
            <Row field="Equity + debt rounds" op="are rejected"><Switch checked={!!cfg.reject_mixed_debt_rounds} onCheckedChange={(v) => setCfg({ reject_mixed_debt_rounds: v })} /></Row>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface shadow-subtle">
          <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">Thesis (Gemini judges fit against these)</h3>
          <div className="divide-y divide-line">
            <Row field="Sector" op="is any of"><ChipsInput label="sectors" value={th.sectors} onChange={(v) => setTh({ sectors: v })} /></Row>
            <Row field="Geography" op="is any of"><ChipsInput label="geographies" value={th.geographies} onChange={(v) => setTh({ geographies: v })} /></Row>
            <Row field="Business model" op="is"><ChipsInput label="business models" value={th.businessModels} onChange={(v) => setTh({ businessModels: v })} /></Row>
            <Row field="Team signals" op="include"><ChipsInput label="team signals" value={th.teamSignals} onChange={(v) => setTh({ teamSignals: v })} /></Row>
            <Row field="Excluded sector" op="is none of"><ChipsInput label="excluded sectors" value={th.excludedSectors} onChange={(v) => setTh({ excludedSectors: v })} /></Row>
            <Row field="Fit score" op="drafts at ≥"><NumberField value={th.fitThreshold} onChange={(n) => setTh({ fitThreshold: n })} suffix="/ 100" /></Row>
            <Row field="Maybe list" op="at ≥"><NumberField value={th.maybeThreshold} onChange={(n) => setTh({ maybeThreshold: n })} suffix="/ 100" /></Row>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface shadow-subtle">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold">Fit weights</h3>
            <span className={cn("text-[12px] tabular-nums", weightTotal === 100 ? "text-text-secondary" : "text-status-maybe")}>
              total {weightTotal}{weightTotal !== 100 && " (normalised when scoring)"}
            </span>
          </div>
          <div className="divide-y divide-line">
            {(Object.keys(WEIGHT_LABELS) as (keyof typeof WEIGHT_LABELS)[]).map((k) => (
              <div key={k} className="grid grid-cols-[170px_1fr_40px] items-center gap-4 px-4 py-3 text-[13px]">
                <span className="font-medium">{WEIGHT_LABELS[k]}</span>
                <Slider value={[th.weights[k]]} min={0} max={60} step={1} onValueChange={([v]) => setTh({ weights: { ...th.weights, [k]: v } })} aria-label={WEIGHT_LABELS[k]} />
                <span className="text-right tabular-nums">{th.weights[k]}</span>
              </div>
            ))}
          </div>
        </div>
        {preview && preview.names.length > 0 && (
          <p className="text-[12px] text-text-secondary">Would draft: {preview.names.join(", ")}</p>
        )}
      </TabsContent>

      <TabsContent value="email" className="space-y-4">
        <div className="rounded-lg border border-line bg-surface shadow-subtle">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold">Cold email rules (checked in code before every send)</h3>
            <Button onClick={saveEmail} disabled={saving || JSON.stringify(email) === JSON.stringify(initialEmail)}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
            </Button>
          </div>
          <div className="divide-y divide-line">
            <Row field="Subject" op="shorter than"><NumberField value={email.subjectMaxChars} onChange={(n) => setEmail({ ...email, subjectMaxChars: n })} suffix="characters" /></Row>
            <Row field="Body" op="shorter than"><NumberField value={email.bodyMaxWords} onChange={(n) => setEmail({ ...email, bodyMaxWords: n })} suffix="words" /></Row>
            <Row field="Banned phrases" op="are none of"><ChipsInput label="banned phrases" value={email.bannedPhrases} onChange={(v) => setEmail({ ...email, bannedPhrases: v })} /></Row>
            <Row field="Spam words" op="are none of"><ChipsInput label="spam words" value={email.spamWords} onChange={(v) => setEmail({ ...email, spamWords: v })} /></Row>
            <Row field="Footer" op="always ends with">
              <Textarea value={email.footer} onChange={(e) => setEmail({ ...email, footer: e.target.value })} rows={5} className="text-[13px]" />
              <p className="mt-1 text-[12px] text-text-secondary">Placeholders: {"{{accelerator_name}}"}, {"{{unsubscribe_url}}"}. Must mention unsubscribe.</p>
            </Row>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
