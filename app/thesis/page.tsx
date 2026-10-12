import { PageIntro } from "@/components/signal/page-intro"
import { SectionCard } from "@/components/signal/section-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const CONDITIONS = [
  ["Employees", "is less than", "500"],
  ["Round stage", "is any of", "pre-seed, seed, angel, seed extension, pre-Series A"],
  ["Round size", "is at most", "$6M (flag up to $10M)"],
  ["Company age", "is at most", "8 years"],
  ["Excluded sector", "is none of", "gambling, tobacco, weapons, …"],
]

export default function ThesisPage() {
  return (
    <div>
      <PageIntro title="Thesis & Rules" description="Edits apply from the next run. No deploy needed." />
      <Tabs defaultValue="thesis">
        <TabsList className="mb-4">
          <TabsTrigger value="thesis">Thesis & gates</TabsTrigger>
          <TabsTrigger value="email">Email rules</TabsTrigger>
        </TabsList>
        <TabsContent value="thesis">
          <SectionCard title="Conditions" bodyClassName="divide-y divide-line">
            {CONDITIONS.map(([field, op, value]) => (
              <div key={field} className="grid grid-cols-1 gap-2 px-4 py-3 text-[13px] sm:grid-cols-[180px_140px_1fr]">
                <span className="font-medium">{field}</span>
                <span className="text-text-secondary">{op}</span>
                <span>{value}</span>
              </div>
            ))}
          </SectionCard>
          <p className="mt-3 text-xs text-text-secondary">Defaults from qualification.md. These become editable once the database is connected (Phase 2/8).</p>
        </TabsContent>
        <TabsContent value="email">
          <SectionCard title="Email rules" bodyClassName="p-4 text-[13px] text-text-secondary">
            Subject under 50 characters · body under 150 words · one yes/no ask · no spam words · unsubscribe footer.
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}
