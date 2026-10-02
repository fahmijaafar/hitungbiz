import { useQuery } from "@tanstack/react-query"
import { FileText } from "lucide-react-motion"
import { EmailBlastingService, type EmailTemplatePublic } from "@/client"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TemplateSelectorProps {
  onSelect: (template: EmailTemplatePublic) => void
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const { data } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => EmailBlastingService.listTemplates({ limit: 100 }),
  })

  const templates = data?.data ?? []

  if (templates.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" />
        Load from template (optional)
      </Label>
      <Select
        onValueChange={(id) => {
          const t = templates.find((t) => t.id === id)
          if (t) onSelect(t)
        }}
      >
        <SelectTrigger id="template-selector" className="h-9">
          <SelectValue placeholder="Choose a template…" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
