import { createFileRoute } from "@tanstack/react-router"
import { Eye, LayoutTemplate } from "lucide-react-motion"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { APP_NAME } from "@/lib/app"
import { getTemplateBuilder } from "@/lib/templates/registry"
import {
  sampleClient,
  sampleCompany,
  sampleDocument,
} from "@/lib/templates/sampleData"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocumentDefaultNote {
  document_type: string
  default_notes_enabled: boolean
  default_notes: string
}

interface CardState {
  enabled: boolean
  notes: string
  savedEnabled: boolean
  savedNotes: string
  isSaving: boolean
}

interface DocumentTemplate {
  id: string
  name: string
  code: string
  description: string | null
  is_default: boolean
  is_active: boolean
}

// ─── Config ──────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  {
    value: "invoice",
    label: "Invoice",
    placeholder:
      "e.g. Thank you for your business!\nPayment is due within 30 days.\nBank: Maybank\nAccount: 1234-5678-9012",
  },
  {
    value: "quotation",
    label: "Quotation",
    placeholder:
      "e.g. This quotation is valid for 30 days.\nPrices are subject to change.\nFor inquiries, contact us at hello@company.com",
  },
  {
    value: "paymentvoucher",
    label: "Payment Voucher",
    placeholder:
      "e.g. Approved by finance department.\nPlease retain this voucher for records.",
  },
  {
    value: "deliveryorder",
    label: "Delivery Order",
    placeholder:
      "e.g. Received above goods in good order and condition.\nPlease verify quantity before signing.",
  },
] as const

type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"]

import {
  CompaniesService,
  DocumentDefaultNoteService,
  DocumentTemplatesService,
} from "@/client"

async function fetchDefaultNotes(): Promise<DocumentDefaultNote[]> {
  const res = await DocumentDefaultNoteService.readDocumentDefaultNotes()
  return (res.data ?? []) as DocumentDefaultNote[]
}

async function saveDefaultNote(
  documentType: string,
  enabled: boolean,
  notes: string,
): Promise<void> {
  await DocumentDefaultNoteService.upsertDocumentDefaultNote({
    documentType,
    requestBody: {
      default_notes_enabled: enabled,
      default_notes: notes.trim(),
    },
  })
}

async function fetchTemplates(): Promise<DocumentTemplate[]> {
  const res = await DocumentTemplatesService.readDocumentTemplates()
  return (res.data ?? []) as DocumentTemplate[]
}

async function fetchCompanyTemplateId(): Promise<string | null> {
  const companyId = localStorage.getItem("company_id")
  if (!companyId) return null
  const company = await CompaniesService.readCompany({ id: companyId })
  return (
    (company as { default_document_template_id?: string | null })
      .default_document_template_id ?? null
  )
}

async function saveCompanyTemplate(templateId: string): Promise<void> {
  const companyId = localStorage.getItem("company_id")
  if (!companyId) throw new Error("No company selected")
  await CompaniesService.updateCompany({
    id: companyId,
    requestBody: { default_document_template_id: templateId },
  })
}

// ─── Template Preview Button ──────────────────────────────────────────────────

function previewTemplate(code: string) {
  const builder = getTemplateBuilder(code)
  const html = builder({
    document: sampleDocument,
    company: sampleCompany,
    client: sampleClient,
  })
  const win = window.open("", "_blank")
  if (!win) {
    toast.error("Preview blocked. Please allow popups and try again.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: DocumentTemplate
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border-2 p-5 transition-all duration-200 group text-left",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      {/* Clickable select surface */}
      <button
        type="button"
        className="absolute inset-0 w-full h-full rounded-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        aria-label={`Select ${template.name} template`}
      />

      {/* Selection indicator */}
      <div className="pointer-events-none absolute top-4 right-4">
        <div
          className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isSelected
              ? "border-primary bg-primary"
              : "border-muted-foreground/40",
          )}
        >
          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>
      </div>

      {/* Template mini-preview thumbnail */}
      <div
        className={cn(
          "pointer-events-none w-full h-28 rounded-lg mb-4 overflow-hidden flex flex-col gap-1 p-2 transition-all",
          isSelected ? "bg-primary/10" : "bg-muted/50",
        )}
      >
        {template.code === "basic" ? (
          // Basic template thumbnail sketch
          <>
            <div className="flex gap-2 items-start">
              <div className="w-6 h-6 rounded bg-muted-foreground/20 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-1.5 w-16 rounded bg-muted-foreground/30" />
                <div className="h-1 w-10 rounded bg-muted-foreground/20" />
              </div>
              <div className="w-14 space-y-1">
                <div className="h-1.5 rounded bg-yellow-400/60" />
                <div className="h-4 rounded bg-muted-foreground/10 border border-muted-foreground/20" />
              </div>
            </div>
            <div className="h-px bg-muted-foreground/15 my-1" />
            <div className="space-y-0.5">
              {[70, 85, 60].map((w) => (
                <div
                  key={`basic-bar-${w}`}
                  className="h-1 rounded bg-muted-foreground/20"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
            <div className="h-px bg-muted-foreground/15 my-1" />
            <div className="flex justify-end">
              <div className="w-20 space-y-0.5">
                {[1, 0.8, 0.6, 1.2].map((o) => (
                  <div
                    key={`basic-total-${o}`}
                    className="h-1 rounded bg-muted-foreground/20"
                    style={{ opacity: o }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : template.code === "modern" ? (
          // Modern template thumbnail sketch
          <>
            <div className="rounded bg-[#1e3a5f] px-2 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded bg-white/20" />
                <div className="space-y-0.5">
                  <div className="h-1 w-10 rounded bg-white/60" />
                  <div className="h-0.5 w-7 rounded bg-white/30" />
                </div>
              </div>
              <div className="space-y-0.5 text-right">
                <div className="h-2 w-12 rounded bg-white/80" />
                <div className="h-1 w-8 rounded bg-white/40" />
              </div>
            </div>
            <div className="rounded bg-[#e8f0fa] px-2 py-1 flex gap-3">
              {["meta-1", "meta-2"].map((id) => (
                <div key={id} className="space-y-0.5">
                  <div className="h-0.5 w-6 rounded bg-[#64748b]" />
                  <div className="h-1 w-8 rounded bg-[#1e3a5f]" />
                </div>
              ))}
            </div>
            <div className="space-y-0.5">
              {[90, 70, 50].map((w) => (
                <div
                  key={`modern-bar-${w}`}
                  className="h-1 rounded bg-muted-foreground/20"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
            <div className="flex justify-end">
              <div className="w-16 rounded bg-[#1e3a5f]/10 border border-[#1e3a5f]/20 p-1 space-y-0.5">
                {[
                  { opacity: 1, width: "70%", id: "tot-1" },
                  { opacity: 0.7, width: "70%", id: "tot-2" },
                  { opacity: 1.3, width: "100%", id: "tot-3" },
                ].map((row) => (
                  <div
                    key={row.id}
                    className="h-0.5 rounded bg-[#1e3a5f]"
                    style={{ opacity: row.opacity, width: row.width }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : template.code === "compact" ? (
          // Compact Dense template thumbnail sketch
          <>
            {/* Header strip */}
            <div className="rounded-sm bg-[#222] px-1.5 py-1 flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm bg-white/25 shrink-0" />
                <div className="space-y-0.5">
                  <div className="h-0.5 w-8 rounded bg-white/70" />
                  <div className="h-0.5 w-5 rounded bg-white/35" />
                </div>
              </div>
              <div className="h-2 w-8 rounded bg-white/80" />
            </div>
            {/* Meta band */}
            <div className="bg-[#f0f0f0] px-1.5 py-0.5 flex gap-2 mb-0.5">
              {["band-1", "band-2", "band-3"].map((id) => (
                <div key={id} className="h-1 w-6 rounded bg-[#888]/40" />
              ))}
            </div>
            {/* Dense table rows */}
            <div className="space-y-px">
              {[
                { width: 100, even: true },
                { width: 80, even: false },
                { width: 70, even: true },
                { width: 85, even: false },
                { width: 65, even: true },
              ].map((row) => (
                <div
                  key={`compact-bar-${row.width}`}
                  className={`h-1 rounded ${row.even ? "bg-muted-foreground/15" : "bg-muted-foreground/08"}`}
                  style={{ width: `${row.width}%` }}
                />
              ))}
            </div>
            {/* Bottom: notes left, totals right */}
            <div className="flex gap-1 mt-0.5">
              <div className="flex-1 space-y-0.5">
                {[1, 0.7, 0.5].map((o) => (
                  <div
                    key={`compact-note-${o}`}
                    className="h-0.5 rounded bg-muted-foreground/30"
                    style={{ opacity: o }}
                  />
                ))}
              </div>
              <div className="w-12 rounded bg-[#222]/10 border border-[#222]/20 space-y-px p-0.5">
                {[
                  { opacity: 0.6, isTotal: false, id: "subtotal" },
                  { opacity: 0.6, isTotal: false, id: "tax" },
                  { opacity: 0.6, isTotal: false, id: "discount" },
                  { opacity: 1, isTotal: true, id: "total" },
                ].map((row) => (
                  <div
                    key={row.id}
                    className={`h-0.5 rounded ${row.isTotal ? "bg-[#222]" : "bg-muted-foreground/30"}`}
                    style={{ opacity: row.opacity }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Template info */}
      <div className="pointer-events-none space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{template.name}</span>
          {template.is_default && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              Default
            </span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {template.description}
          </p>
        )}
      </div>

      {/* Preview button */}
      <button
        type="button"
        id={`preview-${template.code}`}
        onClick={(e) => {
          e.stopPropagation()
          previewTemplate(template.code)
        }}
        className="relative z-10 mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <Eye className="h-3 w-3" />
        Preview
      </button>
    </div>
  )
}

// ─── Template Section ─────────────────────────────────────────────────────────

function TemplateSection() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    // 1. Fetch template cards
    fetchTemplates()
      .then((tmplList) => {
        if (cancelled) return
        const list = Array.isArray(tmplList) ? tmplList : []
        setTemplates(list)
        const defaultId =
          list.find((t) => t.is_default)?.id ?? list[0]?.id ?? null
        setSelectedId((current) => current ?? defaultId)
        setSavedId((current) => current ?? defaultId)
      })
      .catch((err) => {
        console.error("Failed to load templates:", err)
        if (!cancelled) toast.error("Failed to load document templates")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    // 2. Separately fetch company default template selection
    fetchCompanyTemplateId()
      .then((companyTemplateId) => {
        if (cancelled || !companyTemplateId) return
        setSelectedId(companyTemplateId)
        setSavedId(companyTemplateId)
      })
      .catch((err) => {
        console.warn("Could not load company template preference:", err)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const isDirty = selectedId !== savedId

  const handleSave = async () => {
    if (!selectedId) return
    setIsSaving(true)
    try {
      await saveCompanyTemplate(selectedId)
      setSavedId(selectedId)
      const name = templates.find((t) => t.id === selectedId)?.name
      toast.success("Template saved!", {
        description: `${name} is now your default template.`,
      })
    } catch {
      toast.error("Failed to save template. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose the default template used when printing or exporting
            documents.
          </p>
        </div>
        {isDirty && (
          <span className="text-xs text-amber-500 font-medium shrink-0">
            Unsaved changes
          </span>
        )}
      </div>

      <div className="px-5 py-5">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-56 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isSelected={selectedId === t.id}
                  onSelect={() => setSelectedId(t.id)}
                />
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                id="save-template"
                size="sm"
                disabled={!isDirty || isSaving}
                onClick={handleSave}
                className="min-w-28"
              >
                {isSaving ? "Saving…" : "Save Template"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page Component ───────────────────────────────────────────────────────────

function DocumentSettingsPage() {
  const [selected, setSelected] = useState<DocumentType>("invoice")
  const [cards, setCards] = useState<Record<DocumentType, CardState>>(() => {
    const initial: Partial<Record<DocumentType, CardState>> = {}
    for (const dt of DOCUMENT_TYPES) {
      initial[dt.value] = {
        enabled: false,
        notes: "",
        savedEnabled: false,
        savedNotes: "",
        isSaving: false,
      }
    }
    return initial as Record<DocumentType, CardState>
  })
  const [isLoading, setIsLoading] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load settings on mount
  useEffect(() => {
    let cancelled = false
    fetchDefaultNotes()
      .then((data) => {
        if (cancelled) return
        setCards((prev) => {
          const next = { ...prev }
          for (const record of data) {
            if (!record || typeof record !== "object") continue
            const type = record.document_type as DocumentType
            if (DOCUMENT_TYPES.some((dt) => dt.value === type)) {
              const enabled = Boolean(record.default_notes_enabled)
              const notes = String(record.default_notes ?? "")
              next[type] = {
                enabled,
                notes,
                savedEnabled: enabled,
                savedNotes: notes,
                isSaving: false,
              }
            }
          }
          return next
        })
      })
      .catch((err) => {
        console.error("Failed to load document settings:", err)
        if (!cancelled) toast.error("Failed to load document settings")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-resize textarea when notes or selected type changes
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [])

  // Warn on unsaved changes before leaving
  const hasAnyDirty = DOCUMENT_TYPES.some((dt) => {
    const s = cards[dt.value]
    return s.enabled !== s.savedEnabled || s.notes !== s.savedNotes
  })

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasAnyDirty) e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [hasAnyDirty])

  const current = cards[selected]
  const isDirty =
    current.enabled !== current.savedEnabled ||
    current.notes !== current.savedNotes

  const handleChange = useCallback(
    (patch: Partial<CardState>) => {
      setCards((prev) => ({
        ...prev,
        [selected]: { ...prev[selected], ...patch },
      }))
    },
    [selected],
  )

  const handleSave = useCallback(async () => {
    setCards((prev) => ({
      ...prev,
      [selected]: { ...prev[selected], isSaving: true },
    }))
    try {
      const state = cards[selected]
      await saveDefaultNote(selected, state.enabled, state.notes)
      const trimmedNotes = state.notes.trim()
      setCards((prev) => ({
        ...prev,
        [selected]: {
          ...prev[selected],
          notes: trimmedNotes,
          savedEnabled: state.enabled,
          savedNotes: trimmedNotes,
          isSaving: false,
        },
      }))
      const label = DOCUMENT_TYPES.find((dt) => dt.value === selected)?.label
      toast.success("Success!", {
        description: `${label} default notes saved.`,
      })
    } catch {
      setCards((prev) => ({
        ...prev,
        [selected]: { ...prev[selected], isSaving: false },
      }))
      toast.error("Something went wrong!", {
        description: "Failed to save settings. Please try again.",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, selected])

  const selectedDocType =
    DOCUMENT_TYPES.find((dt) => dt.value === selected) ?? DOCUMENT_TYPES[0]

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-6 w-6 text-primary" />
          <h1 className="font-bold text-2xl tracking-tight">
            Document Settings
          </h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Configure default remarks and the document template for your company
        </p>
      </div>

      {/* ── Document Template section ── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Document Template
        </h2>
        <TemplateSection />
      </div>

      {/* ── Default Notes section ── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Default Remarks/Notes
        </h2>
        <div className="flex flex-col gap-4 md:flex-row md:gap-6">
          {/* Left — Document type selector */}
          <div className="flex flex-row gap-2 md:flex-col md:w-48 md:shrink-0">
            {DOCUMENT_TYPES.map((dt) => {
              const isActive = selected === dt.value
              const hasUnsaved =
                cards[dt.value].enabled !== cards[dt.value].savedEnabled ||
                cards[dt.value].notes !== cards[dt.value].savedNotes
              return (
                <Button
                  key={dt.value}
                  type="button"
                  id={`tab-${dt.value}`}
                  variant={isActive ? "default" : "outline"}
                  onClick={() => setSelected(dt.value)}
                  className="relative flex-1 md:flex-none w-full justify-center md:justify-start text-sm font-medium"
                >
                  {dt.label}
                  {hasUnsaved && !isActive && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-amber-400" />
                  )}
                </Button>
              )
            })}
          </div>

          {/* Right — Settings panel */}
          <div className="flex-1 rounded-xl border bg-card shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-semibold text-base">
                  {selectedDocType.label}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Default notes for new {selectedDocType.label.toLowerCase()}{" "}
                  documents
                </p>
              </div>
              {isDirty && (
                <span className="text-xs text-amber-500 font-medium shrink-0">
                  Unsaved changes
                </span>
              )}
            </div>

            {/* Card body */}
            <div className="px-5 py-5 space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-6 w-40 rounded bg-muted animate-pulse" />
                  <div className="h-36 rounded bg-muted animate-pulse" />
                  <div className="h-9 w-28 rounded bg-muted animate-pulse ml-auto" />
                </div>
              ) : (
                <>
                  {/* Toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`enable-${selected}`}
                      className="text-sm font-medium cursor-pointer"
                    >
                      Enable Default Notes
                    </Label>
                    <button
                      id={`enable-${selected}`}
                      type="button"
                      role="switch"
                      aria-checked={current.enabled}
                      onClick={() =>
                        handleChange({ enabled: !current.enabled })
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        current.enabled ? "bg-primary" : "bg-input",
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                          current.enabled ? "translate-x-5" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>

                  {/* Textarea */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Default Notes</Label>
                    <div
                      className={cn(
                        "transition-opacity",
                        !current.enabled && "opacity-50 pointer-events-none",
                      )}
                    >
                      <textarea
                        ref={textareaRef}
                        key={selected}
                        id={`notes-${selected}`}
                        value={current.notes}
                        onChange={(e) =>
                          handleChange({ notes: e.target.value })
                        }
                        placeholder={
                          current.enabled
                            ? selectedDocType.placeholder
                            : "Enable default notes to edit"
                        }
                        disabled={!current.enabled}
                        className="w-full min-h-40 resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed transition-all"
                        style={{ overflow: "hidden" }}
                      />
                    </div>
                  </div>

                  {/* Save button */}
                  <div className="flex justify-end pt-1">
                    <Button
                      id={`save-${selected}`}
                      size="sm"
                      disabled={!isDirty || current.isSaving}
                      onClick={handleSave}
                      className="min-w-28"
                    >
                      {current.isSaving ? "Saving…" : "Save Settings"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_layout/document-settings")({
  component: DocumentSettingsPage,
  head: () => ({
    meta: [{ title: `Document Settings - ${APP_NAME}` }],
  }),
})

export default DocumentSettingsPage
