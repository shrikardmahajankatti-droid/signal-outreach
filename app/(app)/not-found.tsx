import Link from "next/link"
import { SearchX } from "lucide-react"
import { EmptyState } from "@/components/signal/empty-state"
import { SectionCard } from "@/components/signal/section-card"

export default function NotFound() {
  return (
    <SectionCard>
      <EmptyState icon={SearchX} title="Not found" description="This record doesn't exist (or was removed by a demo reset)." action={<Link href="/" className="text-[13px] text-link hover:underline">Back to Home</Link>} />
    </SectionCard>
  )
}
