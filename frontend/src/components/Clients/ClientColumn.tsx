import type { ColumnDef } from "@tanstack/react-table"
import type { ClientPublic } from "@/client"
import { ClientActionsMenu } from "./ClientActionsMenu"

export const columns: ColumnDef<ClientPublic>[] = [
  {
    id: "row",
    header: "#",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.index + 1}</span>
    ),
    size: 48,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "phone_number",
    header: "Phone",
    cell: ({ row }) => <span>{row.original.phone_number || "-"}</span>,
  },
  {
    accessorKey: "company_name",
    header: "Company Name",
    cell: ({ row }) => <span>{row.original.company_name || "-"}</span>,
  },
  {
    accessorKey: "billing_address",
    header: "Address",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
        {row.original.billing_address || "-"}
      </span>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <ClientActionsMenu client={row.original} />
      </div>
    ),
  },
]
