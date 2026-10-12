import { Skeleton } from "@/components/ui/skeleton"
import { PageIntro } from "@/components/signal/page-intro"

export default function Loading() {
  return (
    <div>
      <PageIntro title="Analytics" description="How the engine is performing over the last 30 days." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[300px]" />)}
      </div>
    </div>
  )
}
