import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface PendingTableProps {
  columns?: ColumnDef<unknown>[]
}

const getColumnKey = (column: ColumnDef<unknown>, index: number): string => {
  if (column.id) return column.id
  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey
  }
  return `col-${index}`
}

const PendingTable = ({ columns = [] }: PendingTableProps) => {
  const rowIds = useMemo(
    () => Array.from({ length: 5 }, (_, i) => `skeleton-row-${i}`),
    [],
  )

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => {
            const columnKey = getColumnKey(column, index)
            const headerContent =
              typeof column.header === "function"
                ? columnKey === "actions"
                  ? null
                  : column.header({} as never)
                : column.header

            if (columnKey === "actions" || headerContent === null) {
              return (
                <TableHead key={columnKey}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              )
            }

            return (
              <TableHead key={columnKey}>{String(headerContent)}</TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rowIds.map((id) => (
          <TableRow key={id}>
            {columns.map((column, index) => {
              const columnKey = getColumnKey(column, index)
              return (
                <TableCell key={columnKey}>
                  {columnKey === "actions" ? (
                    <div className="flex justify-end">
                      <Skeleton className="size-8 rounded-md" />
                    </div>
                  ) : (
                    <Skeleton className="h-4 w-24" />
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default PendingTable
