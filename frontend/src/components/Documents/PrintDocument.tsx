import { useQuery } from "@tanstack/react-query"
import { Printer } from "lucide-react-motion"

import {
  type ClientPublic,
  ClientsService,
  CompaniesService,
  type CompanyPublic,
  type DocumentPublic,
  DocumentTemplatesService,
} from "@/client"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import useCustomToast from "@/hooks/useCustomToast"
import { getTemplateBuilder } from "@/lib/templates/registry"
import type { CompanyWithLogo } from "@/lib/templates/types"

// Re-export types consumed by other parts of the app
export type { CompanyWithLogo }

type PrintDocumentProps = {
  document: DocumentPublic
  onSuccess?: () => void
}

/**
 * Build a printable HTML document string using the company's selected template.
 * Falls back to the Basic template if no template is configured.
 */
export function buildPrintableDocument({
  document,
  company,
  client,
  templateCode,
}: {
  document: DocumentPublic
  company?: CompanyWithLogo
  client?: ClientPublic
  /** Override — used by the preview feature. If omitted, reads from company settings. */
  templateCode?: string | null
}) {
  const code =
    templateCode ??
    (
      company as
        | (CompanyPublic & { default_document_template_id?: string | null })
        | undefined
    )?.default_document_template_id ??
    null

  // Resolve code from the templates API response cached in the query client
  // We pass `code` as a UUID; we need to resolve it to a string code like "basic" / "modern".
  // The resolution happens in openPrintPopup/PrintDocument which fetch the templates list.
  const builder = getTemplateBuilder(code)
  return builder({ document, company, client })
}

export function openPrintPopup({
  document,
  company,
  client,
  templateCode,
  onSuccess,
}: {
  document: DocumentPublic
  company?: CompanyWithLogo
  client?: ClientPublic
  /** Template code string e.g. "basic" | "modern". If omitted, reads company default. */
  templateCode?: string | null
  onSuccess?: () => void
}) {
  const iframe = window.document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  iframe.style.visibility = "hidden"

  const html = buildPrintableDocument({
    document,
    company,
    client,
    templateCode,
  })

  window.document.body.appendChild(iframe)

  const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument
  if (iframeDoc) {
    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()
  }

  window.setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }, 1000)
  }, 300)

  onSuccess?.()
  return true
}

const PrintDocument = ({ document, onSuccess }: PrintDocumentProps) => {
  const { showErrorToast } = useCustomToast()
  const companyId = document.company_id ?? localStorage.getItem("company_id")

  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => CompaniesService.readCompany({ id: companyId ?? "" }),
    enabled: !!companyId,
  })

  const { data: client } = useQuery({
    queryKey: ["client", document.client_id],
    queryFn: () => ClientsService.readClient({ id: document.client_id ?? "" }),
    enabled: !!document.client_id,
  })

  // Fetch active templates to resolve the company's template ID → code string
  const { data: templates } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const res = await DocumentTemplatesService.readDocumentTemplates()
      return (res.data ?? []) as Array<{ id: string; code: string }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const handlePrint = () => {
    // Resolve company's template UUID → template code string
    const companyRecord = company as
      | (CompanyPublic & { default_document_template_id?: string | null })
      | undefined
    const templateId = companyRecord?.default_document_template_id
    const templateCode =
      templates?.find((t) => t.id === templateId)?.code ?? "basic"

    const ok = openPrintPopup({
      document,
      company: company as CompanyWithLogo | undefined,
      client,
      templateCode,
      onSuccess,
    })

    if (!ok) {
      showErrorToast(
        "Unable to open the print popup. Please allow popups and try again.",
      )
    }
  }

  return (
    <DropdownMenuItem onClick={handlePrint}>
      <Printer />
      Print Document
    </DropdownMenuItem>
  )
}

export default PrintDocument
