import type { LucideIcon } from "lucide-react"
import { AlertTriangle } from "lucide-react"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-text-secondary">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-text-secondary">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-[#FBECEC] text-status-rejected">
        <AlertTriangle className="size-5" />
      </span>
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-sm text-[13px] text-text-secondary">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
