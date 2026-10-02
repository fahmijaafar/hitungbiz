import { TriangleAlert as AlertTriangle } from "lucide-react-motion"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/currency"
import type { ExpenseCategoryDeduction } from "@/lib/taxAdvisor"

interface PossibleDeductionsTableProps {
  items: ExpenseCategoryDeduction[]
}

function getTreatmentBadge(treatment: string) {
  switch (treatment) {
    case "deductible":
      return (
        <Badge
          variant="outline"
          className="border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Deductible
        </Badge>
      )
    case "conditional":
      return (
        <Badge
          variant="outline"
          className="border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
        >
          Conditional
        </Badge>
      )
    case "non_deductible":
      return (
        <Badge
          variant="outline"
          className="border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          Non-Deductible
        </Badge>
      )
    case "capital_allowance":
      return (
        <Badge
          variant="outline"
          className="border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
        >
          Capital Allowance
        </Badge>
      )
    case "prepayment":
      return (
        <Badge
          variant="outline"
          className="border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
        >
          Prepayment
        </Badge>
      )
    case "deposit":
      return (
        <Badge
          variant="outline"
          className="border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
        >
          Deposit
        </Badge>
      )
    case "owner_drawing":
      return (
        <Badge
          variant="outline"
          className="border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
        >
          Owner Drawing
        </Badge>
      )
    default:
      return <Badge variant="outline">{treatment}</Badge>
  }
}

export function PossibleDeductionsTable({
  items,
}: PossibleDeductionsTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
        No expense transactions recorded for this period.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="p-6 border-b">
        <h3 className="font-semibold text-lg tracking-tight">
          Possible Tax Deductions
        </h3>
        <p className="text-sm text-muted-foreground">
          Categorized analysis of recorded business expenses and their tax
          treatment for income tax estimation.
        </p>
      </div>
      <div className="overflow-x-auto p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Total Recorded</TableHead>
              <TableHead>Tax Treatment</TableHead>
              <TableHead className="text-right">Estimated Deductible</TableHead>
              <TableHead className="text-center">Requires Review</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.category}>
                <TableCell className="font-medium">{item.category}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.total_recorded)}
                </TableCell>
                <TableCell>{getTreatmentBadge(item.tax_treatment)}</TableCell>
                <TableCell className="text-right font-medium">
                  {item.estimated_deductible > 0
                    ? formatCurrency(item.estimated_deductible)
                    : "RM0.00"}
                </TableCell>
                <TableCell className="text-center">
                  {item.requires_review ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded">
                      <AlertTriangle className="h-3 w-3" />
                      Requires Review
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.notes || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
