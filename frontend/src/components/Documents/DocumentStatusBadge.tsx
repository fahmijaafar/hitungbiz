import { Badge } from "@/components/ui/badge"
import { getDocumentStatusStyle } from "@/lib/documentStatus"
import { cn } from "@/lib/utils"

type DocumentStatusBadgeProps = {
  status?: string | null
  className?: string
}

export function DocumentStatusBadge({
  status,
  className,
}: DocumentStatusBadgeProps) {
  const style = getDocumentStatusStyle(status)

  return (
    <Badge
      variant="outline"
      className={cn(
        "px-2 py-0.5 text-xs font-medium border shadow-none",
        style.className,
        className,
      )}
    >
      {status ?? "Draft"}
    </Badge>
  )
}

export default DocumentStatusBadge
