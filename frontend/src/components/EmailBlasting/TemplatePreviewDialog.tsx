import { Eye } from "lucide-react-motion"
import type { EmailTemplatePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { APP_NAME } from "@/lib/app"

interface TemplatePreviewDialogProps {
  template: EmailTemplatePublic
}

// Sample placeholder values for preview
const SAMPLE_CONTEXT: Record<string, string> = {
  "{{user_name}}": "John Doe",
  "{{email}}": "john@example.com",
  "{{company_name}}": "Acme Corp",
  "{{app_name}}": APP_NAME,
  "{{support_email}}": "support@example.com",
  "{{current_date}}": new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
}

function applyPlaceholders(text: string): string {
  return Object.entries(SAMPLE_CONTEXT).reduce(
    (acc, [key, val]) => acc.split(key).join(val),
    text,
  )
}

export function TemplatePreviewDialog({
  template,
}: TemplatePreviewDialogProps) {
  const previewBody = applyPlaceholders(template.body)
  const previewSubject = applyPlaceholders(template.subject)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Preview template">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview: {template.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="rounded-md border bg-muted px-4 py-2 text-sm">
            <span className="font-semibold text-muted-foreground">
              Subject:{" "}
            </span>
            {previewSubject}
          </div>
          <div className="rounded-lg border bg-white min-h-[400px] overflow-hidden shadow-inner">
            <iframe
              title="Template preview"
              srcDoc={previewBody}
              className="w-full min-h-[400px] border-0"
              sandbox="allow-same-origin"
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Preview uses sample placeholder values: John Doe · john@example.com
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
