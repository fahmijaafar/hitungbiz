import type { ColumnDef } from "@tanstack/react-table"
import type { PurchasePublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import { formatDateDMY } from "@/lib/utils"
import { PurchaseActionsMenu } from "./PurchaseActionsMenu"

export const columns: ColumnDef<PurchasePublic>[] = [
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
    accessorKey: "supplier_name",
    header: "Supplier",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.supplier_name}</span>
    ),
  },
  {
    accessorKey: "due_date",
    header: "Due Date",
    cell: ({ row }) => <span>{formatDateDMY(row.original.due_date)}</span>,
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => <span>{row.original.category}</span>,
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => <span>{formatCurrency(row.original.amount)}</span>,
  },
  {
    accessorKey: "tax",
    header: "Tax",
    cell: ({ row }) => (
      <span className="text-rose-600 dark:text-rose-400">
        {formatCurrency(row.original.tax)}
      </span>
    ),
  },
  {
    accessorKey: "final_amount",
    header: "Final Amount",
    cell: ({ row }) => (
      <span className="font-semibold text-rose-600 dark:text-rose-400">
        {formatCurrency(row.original.final_amount)}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <PurchaseActionsMenu purchase={row.original} />
      </div>
    ),
  },
]
