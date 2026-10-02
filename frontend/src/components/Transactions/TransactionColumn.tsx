import type { ColumnDef } from "@tanstack/react-table"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react-motion"

import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/currency"
import { cn, formatDateDMY } from "@/lib/utils"

export type Transaction = {
  id: string
  sourceType: "sale" | "purchase"
  sourceId: string
  date: string
  title: string
  detail: string
  amount: number
  direction: "revenue" | "expense"
  status: string
  notes?: string
  channel?: string
  supplierName?: string
  category?: string
}

function statusClass(status: string) {
  const normalized = status.toLowerCase()
  if (["completed", "complete", "paid"].includes(normalized)) {
    return "text-emerald-600"
  }
  if (["pending", "draft"].includes(normalized)) {
    return "text-amber-500"
  }
  if (["canceled", "cancelled", "void"].includes(normalized)) {
    return "text-rose-500"
  }
  return "text-muted-foreground"
}

export const columns: ColumnDef<Transaction>[] = [
  {
    id: "row",
    header: "#",
    cell: ({ row, table }) => {
      const { pageIndex, pageSize } = table.getState().pagination
      const displayIndex = table
        .getRowModel()
        .rows.findIndex((r) => r.id === row.id)
      return (
        <span className="text-muted-foreground text-sm">
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
    accessorKey: "direction",
    header: "Type",
    cell: ({ row }) => {
      const isRevenue = row.original.direction === "revenue"
      const Icon = isRevenue ? ArrowUpRight : ArrowDownLeft

      return (
        <Badge
          variant="outline"
          className={cn(
            "gap-1 capitalize",
            isRevenue
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {row.original.direction}
        </Badge>
      )
    },
  },
  {
    accessorKey: "title",
    header: "Source",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.title}</span>
      </div>
    ),
  },
  {
    accessorKey: "detail",
    header: "Category / Channel",
    cell: ({ row }) => <span>{row.original.detail || "-"}</span>,
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span
        className={cn(
          "font-semibold",
          row.original.amount >= 0 ? "text-emerald-600" : "text-rose-600",
        )}
      >
        {formatCurrency(row.original.amount)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <span
        className={cn(
          "font-medium capitalize",
          statusClass(row.original.status),
        )}
      >
        {row.original.status}
      </span>
    ),
  },
]
