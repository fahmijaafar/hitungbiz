import { Download } from "lucide-react-motion"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ImportResult = {
  imported: number
  failed: number
  skipped: number
  processing_time_ms: number
  results: Array<{
    row_number: number
    status: string
    errors: string[]
  }>
}

type ImportProgressDialogProps = {
  open: boolean
  isImporting: boolean
  result?: ImportResult
  onOpenChange: (open: boolean) => void
  onDownloadErrors: () => void
}

export function ImportProgressDialog({
  open,
  isImporting,
  result,
  onOpenChange,
  onDownloadErrors,
}: ImportProgressDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isImporting ? "Importing transactions" : "Import complete"}
          </DialogTitle>
          <DialogDescription>
            {isImporting
              ? "Selected valid rows are being inserted in batches."
              : "Review the import result below."}
          </DialogDescription>
        </DialogHeader>

        {isImporting ? (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        ) : null}

        {result ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">Imported</div>
              <div className="text-xl font-semibold">{result.imported}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">Failed</div>
              <div className="text-xl font-semibold">{result.failed}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">Skipped</div>
              <div className="text-xl font-semibold">{result.skipped}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">Time</div>
              <div className="text-xl font-semibold">
                {result.processing_time_ms}ms
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {result && result.failed > 0 ? (
            <Button type="button" variant="outline" onClick={onDownloadErrors}>
              <Download className="mr-2 size-4" />
              Error report
            </Button>
          ) : null}
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
