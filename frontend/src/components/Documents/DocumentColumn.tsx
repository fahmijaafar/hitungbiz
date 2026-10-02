import type { ColumnDef } from "@tanstack/react-table"

import type { DocumentPublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import { formatDateDMY } from "@/lib/utils"
import { DocumentActionsMenu } from "./DocumentActionsMenu"

import { DocumentStatusBadge } from "./DocumentStatusBadge"

const documentTypeLabel: Record<string, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  paymentvoucher: "Payment Voucher",
  deliveryorder: "Delivery Order",
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

export const columns: ColumnDef<DocumentPublic>[] = [
  {
    id: "row",
    header: "#",
    cell: ({ row, table }) => {
      const { pageIndex, pageSize } = table.getState().pagination
      const displayIndex = table
        .getRowModel()
        .rows.findIndex((r) => r.id === row.id)
      return (
        <span className="text-sm text-muted-foreground">
          {pageIndex * pageSize + displayIndex + 1}
        </span>
      )
    },
    size: 48,
  },
  {
    accessorKey: "docno",
    header: "Doc No",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.docno}</span>
    ),
  },
  {
    accessorKey: "doctype",
    header: "Type",
    cell: ({ row }) => (
      <span>
        {documentTypeLabel[row.original.doctype] ?? row.original.doctype}
      </span>
    ),
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => <span>{formatDateDMY(row.original.date)}</span>,
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => <span>{row.original.title}</span>,
  },
  {
    id: "client",
    header: "Client",
    cell: ({ row }) => <span>{getClientName(row.original)}</span>,
  },
  {
    id: "total",
    header: "Final Total",
    cell: ({ row }) => (
      <span>{formatCurrency(getFinalTotal(row.original))}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <DocumentStatusBadge status={row.original.status} />,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DocumentActionsMenu document={row.original} />
      </div>
    ),
  },
]
