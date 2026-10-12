import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function SectionCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      {title && (
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Card>
  )
}
