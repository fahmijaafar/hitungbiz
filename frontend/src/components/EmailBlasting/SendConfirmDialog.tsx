import {
  TriangleAlert as AlertTriangle,
  Loader as Loader2,
  Send,
  Users,
} from "lucide-react-motion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface SendConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  recipientCount: number
  onConfirm: () => void
  isLoading?: boolean
}

export function SendConfirmDialog({
  open,
  onOpenChange,
  subject,
  recipientCount,
  onConfirm,
  isLoading,
}: SendConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Confirm Campaign Send
          </DialogTitle>
          <DialogDescription>
            Please review the details below before sending. This action cannot
            be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subject
            </span>
            <span className="font-medium">{subject}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recipients
            </span>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-base">
                {recipientCount.toLocaleString()}
              </span>
              <span className="text-muted-foreground">users</span>
            </div>
          </div>
          {recipientCount === 0 && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-700 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-xs">
                No recipients match the selected filters.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || recipientCount === 0}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Send className="mr-2 h-4 w-4" />
            Send to {recipientCount.toLocaleString()} recipients
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
