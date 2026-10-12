"use client"

import { usePathname } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { titleForPath } from "@/lib/nav"
import { RunPipelineButton } from "./run-pipeline-button"

export function Topbar({ demoMode }: { demoMode: boolean }) {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-surface/95 px-4 backdrop-blur md:px-8">
      <h1 className="text-base font-semibold whitespace-nowrap">{titleForPath(pathname)}</h1>
      <div className="relative ml-auto hidden w-full max-w-xs sm:block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-secondary" />
        <Input
          type="search"
          placeholder="Search company or founder"
          className="h-8 bg-background pl-8 text-[13px]"
          aria-label="Search company or founder"
        />
      </div>
      <div className="ml-auto flex items-center gap-3 sm:ml-0">
        {demoMode && (
          <span className="rounded-full bg-[#FBF3E4] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-status-maybe">
            DEMO MODE
          </span>
        )}
        <RunPipelineButton />
      </div>
    </header>
  )
}
