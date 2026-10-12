import {
  BarChart3,
  Home,
  Mail,
  Settings,
  SlidersHorizontal,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  title: string
  icon: LucideIcon
  badgeKey?: "pendingDrafts"
}

export const NAV: NavItem[] = [
  { href: "/", label: "Home", title: "Home", icon: Home },
  { href: "/pipeline", label: "Pipeline", title: "Pipeline", icon: Workflow },
  { href: "/outreach", label: "Outreach", title: "Outreach", icon: Mail, badgeKey: "pendingDrafts" },
  { href: "/leads", label: "Leads", title: "Leads", icon: Users },
  { href: "/thesis", label: "Thesis & Rules", title: "Thesis & Rules", icon: SlidersHorizontal },
  { href: "/analytics", label: "Analytics", title: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", title: "Settings", icon: Settings },
]

export function titleForPath(pathname: string): string {
  const match = NAV.filter((n) => n.href !== "/" && pathname.startsWith(n.href))[0]
  return match?.title ?? "Home"
}
