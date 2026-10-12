"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV } from "@/lib/nav"
import { cn } from "@/lib/utils"

// Mobile only needs to be readable: a horizontal scroller in place of the sidebar.
export function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2 md:hidden">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm text-text-secondary",
              active && "bg-accent font-medium text-foreground"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
