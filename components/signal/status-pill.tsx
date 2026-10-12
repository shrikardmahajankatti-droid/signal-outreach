import { cn } from "@/lib/utils"

export type Status = "draft" | "pending" | "approved" | "sent" | "skipped" | "rejected" | "maybe" | "accepted"

const STYLES: Record<Status, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-[#F1F1F3] text-[#4A4D52]" },
  pending: { label: "Draft", className: "bg-[#F1F1F3] text-[#4A4D52]" },
  approved: { label: "Approved", className: "bg-[#EAF1FD] text-status-approved" },
  sent: { label: "Sent", className: "bg-[#E8F5EE] text-status-sent" },
  skipped: { label: "Skipped", className: "bg-[#F4F4F5] text-text-secondary" },
  rejected: { label: "Rejected", className: "bg-[#FBECEC] text-status-rejected" },
  maybe: { label: "Maybe", className: "bg-[#FBF3E4] text-status-maybe" },
  accepted: { label: "Accepted", className: "bg-[#E8F5EE] text-status-sent" },
}

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = STYLES[status]
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[12px] leading-none font-medium whitespace-nowrap",
        s.className,
        className
      )}
    >
      {s.label}
    </span>
  )
}
