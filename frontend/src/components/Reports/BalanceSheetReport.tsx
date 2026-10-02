import { Landmark, Scale, Wallet } from "lucide-react-motion"
import { useMemo } from "react"

import type {
  BankAccountPublic,
  DocumentPublic,
  ProductPublic,
  PurchasePublic,
  SalePublic,
} from "@/client"
import ReportSummaryCards from "@/components/Reports/ReportSummaryCards"
import ReportTable from "@/components/Reports/ReportTable"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/currency"
import {
  buildBalanceSheet,
  buildProfitLoss,
  type DateRange,
} from "@/lib/reports"
import { cn } from "@/lib/utils"

interface BalanceSheetReportProps {
  sales: SalePublic[]
  purchases: PurchasePublic[]
  documents: DocumentPublic[]
  products: ProductPublic[]
  banks: BankAccountPublic[]
  range: DateRange
}

function LineRow({
  label,
  value,
  strong,
  className,
}: {
  label: string
  value: number
  strong?: boolean
  className?: string
}) {
  return (
    <TableRow className={cn(strong && "border-t-2 bg-muted/40")}>
      <TableCell className={cn(strong ? "font-semibold" : "font-medium")}>
        {label}
      </TableCell>
      <TableCell
        className={cn(
          "text-right",
          strong ? "font-bold" : "font-semibold",
          className,
        )}
      >
        {formatCurrency(value)}
      </TableCell>
    </TableRow>
  )
}

export function BalanceSheetReport({
  sales,
  purchases,
  documents,
  products,
  banks,
  range,
}: BalanceSheetReportProps) {
  const bs = useMemo(() => {
    const { netProfit } = buildProfitLoss(sales, purchases, range)
    return buildBalanceSheet(banks, documents, products, purchases, netProfit)
  }, [sales, purchases, documents, products, banks, range])

  return (
    <div className="flex flex-col gap-6">
      <ReportSummaryCards
        items={[
          {
            label: "Total Assets",
            value: bs.totalAssets,
            icon: Wallet,
            valueClassName: "text-emerald-600",
            iconClassName: "text-emerald-500",
          },
          {
            label: "Total Liabilities",
            value: bs.totalLiabilities,
            icon: Landmark,
            valueClassName: "text-rose-600",
            iconClassName: "text-rose-500",
          },
          {
            label: "Equity",
            value: bs.equity,
            icon: Scale,
            valueClassName:
              bs.equity >= 0 ? "text-emerald-600" : "text-rose-600",
          },
        ]}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2 *:min-w-0">
        {/* Assets */}
        <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <h3 className="font-semibold">Assets</h3>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Cash &amp; Bank
              </span>
              <div className="-mx-4 sm:mx-0">
                <ReportTable
                  labelHeader="Account"
                  rows={bs.cashRows}
                  totalLabel="Total Cash & Bank"
                  total={bs.totalCash}
                  emptyText="No bank accounts recorded"
                  containerClassName="rounded-none sm:rounded-lg border-x-0 sm:border-x"
                />
              </div>
            </div>

            <div className="-mx-4 -mb-4 sm:mx-0 sm:mb-0">
              <Table containerClassName="rounded-none sm:rounded-lg border-x-0 border-b-0 sm:border-x sm:border-b">
                <TableBody>
                  <LineRow
                    label="Accounts Receivable"
                    value={bs.accountsReceivable}
                  />
                  <LineRow label="Inventory" value={bs.inventoryValue} />
                  <LineRow
                    label="Total Assets"
                    value={bs.totalAssets}
                    strong
                    className="text-emerald-600"
                  />
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Liabilities & Equity */}
        <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <h3 className="font-semibold">Liabilities &amp; Equity</h3>

            <div className="-mx-4 -mb-4 sm:mx-0 sm:mb-0">
              <Table containerClassName="rounded-none sm:rounded-lg border-x-0 border-b-0 sm:border-x sm:border-b">
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="text-sm font-medium text-muted-foreground"
                    >
                      Liabilities
                    </TableCell>
                  </TableRow>
                  <LineRow
                    label="Accounts Payable"
                    value={bs.accountsPayable}
                  />
                  <LineRow
                    label="Total Liabilities"
                    value={bs.totalLiabilities}
                    strong
                    className="text-rose-600"
                  />

                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="text-sm font-medium text-muted-foreground pt-6"
                    >
                      Equity
                    </TableCell>
                  </TableRow>
                  <LineRow label="Current Period Profit" value={bs.equity} />
                  <LineRow
                    label="Total Liabilities & Equity"
                    value={bs.totalLiabilitiesAndEquity}
                    strong
                  />
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BalanceSheetReport
