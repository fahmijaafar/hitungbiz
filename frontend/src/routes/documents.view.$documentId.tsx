import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Printer, X } from "lucide-react-motion"
import { useCallback, useEffect, useRef } from "react"
import {
  type ClientPublic,
  type CompanyPublic,
  type DocumentPublic,
  DocumentsService,
  DocumentTemplatesService,
} from "@/client"
import { DocumentStatusBadge } from "@/components/Documents/DocumentStatusBadge"
import {
  buildPrintableDocument,
  openPrintPopup,
} from "@/components/Documents/PrintDocument"
import { Button } from "@/components/ui/button"
import { APP_NAME } from "@/lib/app"

type CompanyWithLogo = CompanyPublic & {
  company_url?: string | null
}

const documentTypeLabel: Record<string, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  paymentvoucher: "Payment Voucher",
  deliveryorder: "Delivery Order",
}

function DocumentViewer() {
  const { documentId } = Route.useParams()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-document", documentId],
    queryFn: () => DocumentsService.readDocumentPublic({ id: documentId }),
    retry: false,
  })

  const document = data?.document as DocumentPublic | undefined
  const company = data?.company as CompanyWithLogo | undefined
  const client = data?.client as ClientPublic | undefined

  // Fetch active templates to resolve the company's template UUID → code string
  const { data: templates } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const res = await DocumentTemplatesService.readDocumentTemplates()
      return (res.data ?? []) as Array<{ id: string; code: string }>
    },
    staleTime: 5 * 60 * 1000,
  })

  // Resolve UUID → code string (e.g. "modern"), fallback to "basic"
  const templateCode =
    templates?.find((t) => t.id === company?.default_document_template_id)
      ?.code ?? "basic"

  const documentType = document
    ? (documentTypeLabel[document.doctype] ?? document.doctype).toUpperCase()
    : ""

  const handlePrint = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.focus()
      iframeRef.current.contentWindow.print()
      return
    }
    if (!document) return
    const ok = openPrintPopup({ document, company, client, templateCode })
    if (!ok) {
      alert(
        "Unable to open the print popup. Please allow popups and try again.",
      )
      return
    }
  }, [document, company, client, templateCode])

  // Set page title when document loads
  useEffect(() => {
    if (document) {
      window.document.title = `${documentType} ${document.docno}`
    }
    return () => {
      window.document.title = `Document - ${APP_NAME}`
    }
  }, [document, documentType])

  // Build printable HTML using the resolved template
  const printableHtml = document
    ? buildPrintableDocument({ document, company, client, templateCode })
    : ""

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-lg text-slate-600">Loading document...</div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100">
        <div className="rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-2xl font-bold text-rose-600">
            Document Not Found
          </h1>
          <p className="text-slate-600">
            The document you are looking for does not exist or has been removed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              #{document.docno}
            </span>
            <span className="text-xs text-slate-500">{documentType}</span>
            <DocumentStatusBadge status={document.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePrint}
            className="inline-flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button
            size="icon"
            asChild
            className="bg-red-600 hover:bg-red-700 text-white md:hidden"
            title="Close and return to documents"
            aria-label="Close document"
          >
            <Link to="/documents">
              <X className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Document Content */}

      <style>{`
        .page .document-header { position: relative; }
        .page .summary-container { position: absolute; right: 0; top: 0; width: 320px; }
        .page .summary { background:#fff; border-radius:8px; box-shadow:0 6px 18px rgba(15,23,42,0.06); font-size:13px; }
        .page .summary th, .page .summary td { padding:10px 12px; border-bottom:1px solid #eef4fb; }
        .page .summary .docno { font-size:18px; padding:14px 12px; text-align:center; font-weight:800; }
        @media (max-width:640px) {
          .page .document-header { flex-direction: column !important; }
          .page .address-container { flex-direction: column !important; }
          .page .summary-container { position: static !important; width: 100% !important; margin-top:12px !important; }
        }
      `}</style>
      <div className="mx-auto w-full p-4 md:p-8 flex justify-center">
        <iframe
          ref={iframeRef}
          title={`Preview ${document?.docno ?? "document"}`}
          srcDoc={printableHtml}
          style={{
            width: "100%",
            maxWidth: "210mm",
            height: "1122px",
            border: "1px solid #e6eef8",
            boxShadow: "0 12px 35px rgba(15,23,42,0.08)",
            background: "white",
          }}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute("/documents/view/$documentId")({
  component: DocumentViewer,
  head: () => ({
    meta: [
      {
        title: `Document - ${APP_NAME}`,
      },
    ],
  }),
})

export default DocumentViewer
