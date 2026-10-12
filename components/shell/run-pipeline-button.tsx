"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"

export function RunPipelineButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function run() {
    setMessage(null)
    startTransition(async () => {
      try {
        const res = await fetch("/api/pipeline/run", { method: "POST" })
        const data = await res.json()
        setMessage(data.message ?? (res.ok ? "Pipeline finished" : "Pipeline failed"))
        router.refresh()
      } catch {
        setMessage("Pipeline failed")
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {message && <span className="hidden text-xs text-text-secondary lg:inline">{message}</span>}
      <Button size="sm" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />}
        Run pipeline now
      </Button>
    </div>
  )
}
