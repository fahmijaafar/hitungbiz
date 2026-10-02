import type { ColumnDef } from "@tanstack/react-table"
import type { SalePublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import { cn, formatDateDMY } from "@/lib/utils"
import { SaleActionsMenu } from "./SaleActionsMenu"

function valueColorClass(value: number) {
  if (value > 0) return "text-green-500"
  if (value < 0) return "text-rose-500"
  return ""
}

export const columns: ColumnDef<SalePublic>[] = [
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
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => <span>{formatDateDMY(row.original.date)}</span>,
  },
  {
    accessorKey: "channel",
    header: "Channel",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.channel}</span>
    ),
  },
  {
    accessorKey: "gross_amount",
    header: "Gross",
    cell: ({ row }) => <span>{formatCurrency(row.original.gross_amount)}</span>,
  },
  {
    accessorKey: "discount",
    header: "Discount",
    cell: ({ row }) => (
      <span className="text-rose-500">
        {formatCurrency(row.original.discount)}
      </span>
    ),
  },
  {
    accessorKey: "cancel_amount",
    header: "Cancel",
    cell: ({ row }) => (
      <span className="text-rose-500">
        {formatCurrency(row.original.cancel_amount)}
      </span>
    ),
  },
  {
    accessorKey: "short_over",
    header: "Short/Over",
    cell: ({ row }) => {
      const v = Number(row.original.short_over)
      return <span className={cn(valueColorClass(v))}>{formatCurrency(v)}</span>
    },
  },
  {
    accessorKey: "net_sales",
    header: "Net Revenue",
    cell: ({ row }) => (
      <span className="text-green-500">
        {formatCurrency(row.original.net_sales)}
      </span>
    ),
  },
  {
    accessorKey: "refund",
    header: "Refund",
    cell: ({ row }) => (
      <span className="text-rose-500">
        {formatCurrency(row.original.refund)}
      </span>
    ),
  },
  {
    accessorKey: "final_amount",
    header: "Final",
    cell: ({ row }) => (
      <span className="text-green-500">
        {formatCurrency(row.original.final_amount)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.status
      let cls = ""
      if (s === "Completed") cls = "text-green-600"
      else if (s === "Pending") cls = "text-amber-500"
      else if (s === "Canceled") cls = "text-rose-500"
      return <span className={cn("capitalize font-medium", cls)}>{s}</span>
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <SaleActionsMenu sale={row.original} />
      </div>
    ),
  },
]
