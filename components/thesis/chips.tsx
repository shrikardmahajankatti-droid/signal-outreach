"use client"

import { useState } from "react"
import { X } from "lucide-react"

export function ChipsInput({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string }) {
  const [draft, setDraft] = useState("")
  function add() {
    const v = draft.trim()
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v])
    setDraft("")
  }
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[12px]">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v} from ${label}`} className="text-text-secondary hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            add()
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={add}
        placeholder={placeholder ?? "Add…"}
        aria-label={`Add to ${label}`}
        className="min-w-[120px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-secondary"
      />
    </div>
  )
}
