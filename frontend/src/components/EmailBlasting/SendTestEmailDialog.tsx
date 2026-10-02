import { useMutation } from "@tanstack/react-query"
import { Loader as Loader2, Send } from "lucide-react-motion"
import { useState } from "react"
import { EmailBlastingService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import useCustomToast from "@/hooks/useCustomToast"

interface SendTestEmailDialogProps {
  subject: string
  body: string
  disabled?: boolean
}

export function SendTestEmailDialog({
  subject,
  body,
  disabled,
}: SendTestEmailDialogProps) {
  const [open, setOpen] = useState(false)
  const [emailTo, setEmailTo] = useState("")
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const sendMutation = useMutation({
    mutationFn: () =>
      EmailBlastingService.sendTestEmail({
        requestBody: { email_to: emailTo, subject, body },
      }),
    onSuccess: () => {
      showSuccessToast(`Test email sent to ${emailTo}`)
      setOpen(false)
    },
    onError: (err: any) => {
      showErrorToast(err?.body?.detail ?? "Failed to send test email")
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Send className="mr-2 h-4 w-4" />
          Send Test Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
          <DialogDescription>
            Enter an email address to receive a test version of this campaign.
            Placeholders will be rendered with your own account data.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Label htmlFor="test-email-to">Send test to</Label>
          <Input
            id="test-email-to"
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!emailTo || sendMutation.isPending}
          >
            {sendMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
