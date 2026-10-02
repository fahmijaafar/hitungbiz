import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react-motion"
import { useMemo, useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/currency"
import type { AmountRow } from "@/lib/reports"
import { cn } from "@/lib/utils"

type SortKey = "label" | "amount"
type SortDir = "asc" | "desc"

interface ReportTableProps {
  /** Header label for the first (category) column. */
  labelHeader: string
  rows: AmountRow[]
  /** Optional total row rendered in the footer. */
  totalLabel?: string
  total?: number
  /** Tailwind text colour class for amounts, e.g. text-green-600. */
  amountClassName?: string
  emptyText?: string
  containerClassName?: string
}

/**
 * Lightweight, sortable two-column (label + amount) table used across the
 * financial report tabs. Sorting toggles on header click.
 */
export function ReportTable({
  labelHeader,
  rows,
  totalLabel,
  total,
  amountClassName,
  emptyText = "No data for the selected period",
  containerClassName,
}: ReportTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("amount")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let cmp: number
      if (sortKey === "label") {
        cmp = a.label.localeCompare(b.label)
      } else {
        cmp = a.amount - b.amount
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "label" ? "asc" : "desc")
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column)
      return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-50" />
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed py-8">
        <span className="text-muted-foreground text-sm">{emptyText}</span>
      </div>
    )
  }

  return (
    <Table containerClassName={containerClassName}>
      <TableHeader>
        <TableRow>
          <TableHead>
            <button
              type="button"
              onClick={() => toggleSort("label")}
              className="flex items-center font-medium"
            >
              {labelHeader}
              <SortIcon column="label" />
            </button>
          </TableHead>
          <TableHead className="text-right">
            <button
              type="button"
              onClick={() => toggleSort("amount")}
              className="ml-auto flex items-center font-medium"
            >
              Amount
              <SortIcon column="amount" />
            </button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell
              className={cn("text-right font-semibold", amountClassName)}
            >
              {formatCurrency(row.amount)}
            </TableCell>
          </TableRow>
        ))}
        {totalLabel !== undefined && total !== undefined && (
          <TableRow className="border-t-2 bg-muted/40">
            <TableCell className="font-semibold">{totalLabel}</TableCell>
            <TableCell className="text-right font-bold">
              {formatCurrency(total)}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

export default ReportTable
