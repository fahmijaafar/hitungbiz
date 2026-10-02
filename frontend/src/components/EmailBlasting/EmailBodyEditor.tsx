import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface EmailBodyEditorProps {
  value: string
  onChange: (value: string) => void
  preview?: boolean
}

export function EmailBodyEditor({
  value,
  onChange,
  preview = true,
}: EmailBodyEditorProps) {
  const [activePane, setActivePane] = useState<"edit" | "preview">("edit")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Email Body</Label>
        <div className="flex rounded-md border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setActivePane("edit")}
            className={`px-3 py-1.5 transition-colors ${
              activePane === "edit"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            Edit
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => setActivePane("preview")}
              className={`px-3 py-1.5 transition-colors ${
                activePane === "preview"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Preview
            </button>
          )}
        </div>
      </div>

      {activePane === "edit" ? (
        <div className="flex flex-col gap-1.5">
          <Textarea
            id="email-body-editor"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write your email body here. Use HTML for formatting.&#10;&#10;Supported placeholders:&#10;{{user_name}} {{email}} {{company_name}} {{app_name}} {{support_email}} {{current_date}}"
            className="min-h-[320px] font-mono text-sm resize-y"
          />
          <p className="text-xs text-muted-foreground">
            Supports HTML. Placeholders:{" "}
            {[
              "{{user_name}}",
              "{{email}}",
              "{{company_name}}",
              "{{app_name}}",
              "{{support_email}}",
              "{{current_date}}",
            ].map((p) => (
              <code
                key={p}
                className="mx-0.5 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground"
              >
                {p}
              </code>
            ))}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white min-h-[340px] overflow-auto shadow-inner">
          {value ? (
            <iframe
              title="Email preview"
              srcDoc={value}
              className="w-full min-h-[340px] border-0"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex items-center justify-center h-[340px] text-muted-foreground text-sm">
              Nothing to preview yet — write some content in the Edit tab.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
