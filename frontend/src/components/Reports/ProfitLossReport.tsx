import { TrendingDown, TrendingUp, Wallet } from "lucide-react-motion"
import { useMemo } from "react"

import type { PurchasePublic, SalePublic } from "@/client"
import ReportSummaryCards from "@/components/Reports/ReportSummaryCards"
import ReportTable from "@/components/Reports/ReportTable"
import { formatCurrency } from "@/lib/currency"
import { buildProfitLoss, type DateRange } from "@/lib/reports"
import { cn } from "@/lib/utils"

interface ProfitLossReportProps {
  sales: SalePublic[]
  purchases: PurchasePublic[]
  range: DateRange
}

export function ProfitLossReport({
  sales,
  purchases,
  range,
}: ProfitLossReportProps) {
  const pl = useMemo(
    () => buildProfitLoss(sales, purchases, range),
    [sales, purchases, range],
  )

  return (
    <div className="flex flex-col gap-6">
      <ReportSummaryCards
        items={[
          {
            label: "Total Revenue",
            value: pl.totalRevenue,
            icon: TrendingUp,
            valueClassName: "text-emerald-600",
            iconClassName: "text-emerald-500",
          },
          {
            label: "Total Expenses",
            value: pl.totalExpenses,
            icon: TrendingDown,
            valueClassName: "text-rose-600",
            iconClassName: "text-rose-500",
          },
          {
            label: pl.netProfit >= 0 ? "Net Profit" : "Net Loss",
            value: pl.netProfit,
            icon: Wallet,
            valueClassName:
              pl.netProfit >= 0 ? "text-emerald-600" : "text-rose-600",
          },
        ]}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2 *:min-w-0">
        <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <h3 className="font-semibold">Revenue by Channel</h3>
            <div className="-mx-4 -mb-4 sm:mx-0 sm:mb-0">
              <ReportTable
                labelHeader="Sales Channel"
                rows={pl.revenueByChannel}
                totalLabel="Total Revenue"
                total={pl.totalRevenue}
                amountClassName="text-emerald-600"
                emptyText="No revenue recorded for this period"
                containerClassName="rounded-none sm:rounded-lg border-x-0 border-b-0 sm:border-x sm:border-b"
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <h3 className="font-semibold">Expenses by Category</h3>
            <div className="-mx-4 -mb-4 sm:mx-0 sm:mb-0">
              <ReportTable
                labelHeader="Expense Category"
                rows={pl.expensesByCategory}
                totalLabel="Total Expenses"
                total={pl.totalExpenses}
                amountClassName="text-rose-600"
                emptyText="No expenses recorded for this period"
                containerClassName="rounded-none sm:rounded-lg border-x-0 border-b-0 sm:border-x sm:border-b"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6 flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            {pl.netProfit >= 0 ? "Net Profit" : "Net Loss"}
          </span>
          <span
            className={cn(
              "text-3xl font-bold",
              pl.netProfit >= 0 ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {formatCurrency(pl.netProfit)}
          </span>
          <span className="text-xs text-muted-foreground">
            Total Revenue {formatCurrency(pl.totalRevenue)} − Total Expenses{" "}
            {formatCurrency(pl.totalExpenses)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default ProfitLossReport
