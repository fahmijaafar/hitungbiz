import {
  EllipsisVertical,
  Eye,
  FilePlus as FilePlus2,
  Pause,
  Pencil,
  Play,
} from "lucide-react-motion"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { RecurringSchedule } from "@/routes/_layout/recurring-invoices"
import DeleteRecurringInvoice from "./DeleteRecurringInvoice"

interface RecurringScheduleActionsMenuProps {
  schedule: RecurringSchedule
  onGenerate: (id: string) => void
  onToggleStatus: (id: string, action: "pause" | "resume") => void
  onDelete?: (id: string) => void
  onEdit: (schedule: RecurringSchedule) => void
  onView: (schedule: RecurringSchedule) => void
}

export function RecurringScheduleActionsMenu({
  schedule,
  onGenerate,
  onToggleStatus,
  onEdit,
  onView,
}: RecurringScheduleActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <EllipsisVertical className="size-4" />
          <span className="sr-only">Open Schedule Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onView(schedule)}>
          <Eye />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(schedule)}>
          <Pencil />
          Edit Recurring Invoice
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onGenerate(schedule.id)}>
          <FilePlus2 />
          Generate Now
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            onToggleStatus(
              schedule.id,
              schedule.status === "Paused" ? "resume" : "pause",
            )
          }
        >
          {schedule.status === "Paused" ? <Play /> : <Pause />}
          {schedule.status === "Paused" ? "Resume" : "Pause"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DeleteRecurringInvoice schedule={schedule} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
