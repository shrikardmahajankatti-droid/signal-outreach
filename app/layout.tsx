import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/shell/sidebar"
import { Topbar } from "@/components/shell/topbar"
import { MobileNav } from "@/components/shell/mobile-nav"
import { TooltipProvider } from "@/components/ui/tooltip"
import { isDemoMode } from "@/lib/env"

export const dynamic = "force-dynamic"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Signal",
  description: "Timed funding outreach engine for early-stage startups",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Pending-draft count comes from Neon from Phase 2 onward.
  const pendingDrafts = 0
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <TooltipProvider>
          <div className="flex min-h-screen">
            <Sidebar pendingDrafts={pendingDrafts} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar demoMode={isDemoMode()} />
              <MobileNav />
              <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-8 md:py-8">
                {children}
              </main>
            </div>
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}
