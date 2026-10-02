import { useQuery } from "@tanstack/react-query"
import { Share2 } from "lucide-react-motion"
import { toast } from "sonner"

import { ClientsService, CompaniesService, type DocumentPublic } from "@/client"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

type ShareDocumentProps = {
  document: DocumentPublic
  onSuccess?: () => void
}

const documentTypeLabel: Record<string, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  paymentvoucher: "Payment Voucher",
  deliveryorder: "Delivery Order",
}

const ShareDocument = ({ document, onSuccess }: ShareDocumentProps) => {
  const companyId =
    document.company_id ??
    (typeof window !== "undefined" ? localStorage.getItem("company_id") : null)

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

  const calculation = document.price_calculation as
    | Record<string, unknown>
    | undefined
  const clientDetails = calculation?.client_details as
    | Record<string, unknown>
    | undefined
  const companyDetails = calculation?.company_details as
    | Record<string, unknown>
    | undefined

  const clientName =
    (clientDetails?.name as string) || client?.name || "Customer"

  const companyName =
    company?.company_name ||
    (companyDetails?.name as string) ||
    (companyDetails?.company_name as string)

  const documentType =
    documentTypeLabel[document.doctype?.toLowerCase()] ??
    (document.doctype
      ? document.doctype.charAt(0).toUpperCase() + document.doctype.slice(1)
      : "Document")

  const shareUrl = `${window.location.origin}/documents/view/${document.id}`

  const textMessage = `Hello ${clientName},

Here's your ${documentType} ${document.docno}.

You can access it online or download a PDF here:
${shareUrl}

Thank you for choosing ${companyName}.`

  const handleShare = async () => {
    const copyToClipboard = async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(textMessage)
        } else {
          const textArea = window.document.createElement("textarea")
          textArea.value = textMessage
          textArea.style.position = "fixed"
          textArea.style.opacity = "0"
          window.document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()
          window.document.execCommand("copy")
          window.document.body.removeChild(textArea)
        }
      } catch {
        // Fallback error ignored
      }
    }

    await copyToClipboard()

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${documentType} ${document.docno}`,
          text: textMessage,
        })
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.success("Document link & message copied")
        }
      }
    } else {
      toast.success("Document link & message copied")
    }

    onSuccess?.()
  }

  return (
    <DropdownMenuItem onClick={handleShare}>
      <Share2 className="h-4 w-4" />
      Share Document
    </DropdownMenuItem>
  )
}

export default ShareDocument
