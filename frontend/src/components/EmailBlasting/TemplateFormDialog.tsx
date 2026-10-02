import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader as Loader2 } from "lucide-react-motion"
import { useEffect, useState } from "react"
import { EmailBlastingService, type EmailTemplatePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import useCustomToast from "@/hooks/useCustomToast"
import { EmailBodyEditor } from "./EmailBodyEditor"

interface TemplateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: EmailTemplatePublic | null
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: TemplateFormDialogProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const isEdit = !!template

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  useEffect(() => {
    if (template) {
      setName(template.name)
      setDescription(template.description ?? "")
      setSubject(template.subject)
      setBody(template.body)
    } else {
      setName("")
      setDescription("")
      setSubject("")
      setBody("")
    }
  }, [template])

  const createMutation = useMutation({
    mutationFn: () =>
      EmailBlastingService.createTemplate({
        requestBody: {
          name,
          description: description || undefined,
          subject,
          body,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] })
      showSuccessToast("Template created")
      onOpenChange(false)
    },
    onError: (err: any) =>
      showErrorToast(err?.body?.detail ?? "Failed to create template"),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      EmailBlastingService.updateTemplate({
        templateId: template!.id,
        requestBody: {
          name,
          description: description || undefined,
          subject,
          body,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] })
      showSuccessToast("Template updated")
      onOpenChange(false)
    },
    onError: (err: any) =>
      showErrorToast(err?.body?.detail ?? "Failed to update template"),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const canSave = name.trim() && subject.trim() && body.trim()

  const handleSave = () => {
    if (isEdit) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Template" : "Create Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-name">Name *</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Welcome email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-subject">Subject *</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Hello {{user_name}}!"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-description">Description</Label>
            <Textarea
              id="tpl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template for?"
              className="min-h-[60px] resize-none"
            />
          </div>

          <EmailBodyEditor value={body} onChange={setBody} />
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
