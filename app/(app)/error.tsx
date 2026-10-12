"use client"

import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/signal/empty-state"
import { SectionCard } from "@/components/signal/section-card"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionCard>
      <ErrorState message={error.message || "Unexpected error"} action={<Button variant="outline" onClick={reset}>Try again</Button>} />
    </SectionCard>
  )
}
