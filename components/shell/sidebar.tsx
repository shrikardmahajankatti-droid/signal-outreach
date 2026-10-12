"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Radio } from "lucide-react"
import { NAV } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function Sidebar({ pendingDrafts }: { pendingDrafts: number }) {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Radio className="size-4" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Signal</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const badge = item.badgeKey === "pendingDrafts" ? pendingDrafts : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-text-secondary transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent font-medium text-foreground"
              )}
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-medium text-primary-foreground tabular-nums">
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-line px-5 py-4 text-xs text-text-secondary">
        Early-stage outreach engine
      </div>
    </aside>
  )
}
