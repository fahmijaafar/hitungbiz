import { useState } from "react"
import type { DocumentPublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import { cn } from "@/lib/utils"
import { DocumentActionsMenu } from "./DocumentActionsMenu"
import { DocumentStatusBadge } from "./DocumentStatusBadge"
import EditDocument from "./EditDocument"

const documentTypeLabel: Record<string, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  paymentvoucher: "Payment Voucher",
  deliveryorder: "Delivery Order",
}

const documentTypeBorderColor: Record<string, string> = {
  quotation: "border-b-3 border-b-neutral-400 dark:border-b-neutral-500",
  invoice: "border-b-3 border-b-green-500 dark:border-b-green-500",
  paymentvoucher: "border-b-3 border-b-red-500 dark:border-b-red-500",
  deliveryorder: "border-b-3 border-b-indigo-500 dark:border-b-indigo-500",
}

function getBottomBorderClass(doctype: string) {
  const normalized = (doctype ?? "").toLowerCase().trim()
  return (
    documentTypeBorderColor[normalized] ??
    "border-b-3 border-b-neutral-400 dark:border-b-neutral-500"
  )
}

function getFinalTotal(document: DocumentPublic) {
  const calculation = document.price_calculation
  if (!calculation || typeof calculation !== "object") return 0
  return Number((calculation as Record<string, unknown>).final_total ?? 0)
}

function getClientName(document: DocumentPublic) {
  const calculation = document.price_calculation
  if (!calculation || typeof calculation !== "object") return "-"
  const clientDetails = (calculation as Record<string, unknown>).client_details
  if (!clientDetails || typeof clientDetails !== "object") return "-"
  return String((clientDetails as Record<string, unknown>).name || "-")
}

interface DocumentCardProps {
  document: DocumentPublic
}

export function DocumentCard({ document }: DocumentCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)

  const handleCardClick = () => {
    setIsEditOpen(true)
  }

  const typeName =
    documentTypeLabel[document.doctype.toLowerCase()] ?? document.doctype

  const bottomBorderClass = getBottomBorderClass(document.doctype)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsEditOpen(true)
          }
        }}
        className={cn(
          "group flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-md cursor-pointer",
          bottomBorderClass,
        )}
      >
        <div>
          {/* Top Row: Doc No, Status Badge, Action Menu */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-base text-foreground tracking-tight">
              {document.docno}
            </span>
            <div
              className="flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <DocumentStatusBadge status={document.status} />
              <DocumentActionsMenu document={document} />
            </div>
          </div>

          {/* Second Row: Document Type · Date */}
          <div className="mt-1 text-xs text-muted-foreground font-medium">
            {typeName} · {document.date ?? "-"}
          </div>

          {/* Document Title (Clamped to 2 lines) */}
          <div className="mt-3 text-sm font-medium text-foreground line-clamp-2 leading-snug">
            {document.title}
          </div>
        </div>

        {/* Bottom Row: Client Name (Left) & Final Total (Right) */}
        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground truncate font-normal">
            {getClientName(document)}
          </span>
          <span className="font-semibold text-foreground shrink-0">
            {formatCurrency(getFinalTotal(document))}
          </span>
        </div>
      </div>

      <EditDocument
        document={document}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => setIsEditOpen(false)}
      />
    </>
  )
}

export default DocumentCard
