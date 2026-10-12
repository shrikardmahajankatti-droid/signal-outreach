import { Sidebar } from "@/components/shell/sidebar"
import { Topbar } from "@/components/shell/topbar"
import { MobileNav } from "@/components/shell/mobile-nav"
import { getDemoMode } from "@/lib/env"
import { pendingDraftCount } from "@/lib/queries"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [pendingDrafts, demoMode] = await Promise.all([pendingDraftCount(), getDemoMode()])
  return (
    <div className="flex min-h-screen">
      <Sidebar pendingDrafts={pendingDrafts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar demoMode={demoMode} />
        <MobileNav />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
