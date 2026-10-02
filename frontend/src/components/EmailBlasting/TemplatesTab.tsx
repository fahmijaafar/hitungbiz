import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Copy,
  Pencil as Edit,
  Loader as Loader2,
  Plus,
  Trash2,
} from "lucide-react-motion"
import { useState } from "react"
import { EmailBlastingService, type EmailTemplatePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useCustomToast from "@/hooks/useCustomToast"
import { TemplateFormDialog } from "./TemplateFormDialog"
import { TemplatePreviewDialog } from "./TemplatePreviewDialog"

export function TemplatesTab() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EmailTemplatePublic | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => EmailBlastingService.listTemplates({ limit: 100 }),
  })
  const templates = data?.data ?? []

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      EmailBlastingService.deleteTemplate({ templateId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] })
      showSuccessToast("Template deleted")
    },
    onError: (err: any) =>
      showErrorToast(err?.body?.detail ?? "Failed to delete"),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) =>
      EmailBlastingService.duplicateTemplate({ templateId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] })
      showSuccessToast("Template duplicated")
    },
    onError: (err: any) =>
      showErrorToast(err?.body?.detail ?? "Failed to duplicate"),
  })

  const openEdit = (t: EmailTemplatePublic) => {
    setEditing(t)
    setFormOpen(true)
  }

  const handleFormClose = (open: boolean) => {
    setFormOpen(open)
    if (!open) setEditing(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage reusable email templates with placeholder support.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <p className="font-medium">No templates yet</p>
          <p className="text-sm">
            Create your first template to reuse across campaigns.
          </p>
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm">
                    {t.subject}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {t.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <TemplatePreviewDialog template={t} />
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => openEdit(t)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Duplicate"
                        onClick={() => duplicateMutation.mutate(t.id)}
                        disabled={duplicateMutation.isPending}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        onClick={() => deleteMutation.mutate(t.id)}
                        disabled={deleteMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={handleFormClose}
        template={editing}
      />
    </div>
  )
}
