import {
  CircleArrowDown as ArrowDownCircle,
  CircleArrowUp as ArrowUpCircle,
  Wallet,
} from "lucide-react-motion"
import { useMemo } from "react"

import type { BankAccountPublic, PurchasePublic, SalePublic } from "@/client"
import ReportSummaryCards from "@/components/Reports/ReportSummaryCards"
import ReportTable from "@/components/Reports/ReportTable"
import { formatCurrency } from "@/lib/currency"
import { buildCashFlow, type DateRange } from "@/lib/reports"
import { cn } from "@/lib/utils"

interface CashFlowReportProps {
  sales: SalePublic[]
  purchases: PurchasePublic[]
  banks: BankAccountPublic[]
  range: DateRange
}

export function CashFlowReport({
  sales,
  purchases,
  banks,
  range,
}: CashFlowReportProps) {
  const cf = useMemo(
    () => buildCashFlow(sales, purchases, banks, range),
    [sales, purchases, banks, range],
  )

  return (
    <div className="flex flex-col gap-6">
      <ReportSummaryCards
        items={[
          {
            label: "Total Inflows",
            value: cf.totalInflows,
            icon: ArrowDownCircle,
            valueClassName: "text-emerald-600",
            iconClassName: "text-emerald-500",
          },
          {
            label: "Total Outflows",
            value: cf.totalOutflows,
            icon: ArrowUpCircle,
            valueClassName: "text-rose-600",
            iconClassName: "text-rose-500",
          },
          {
            label: cf.netCashFlow >= 0 ? "Net Cash Flow" : "Net Cash Outflow",
            value: cf.netCashFlow,
            icon: Wallet,
            valueClassName:
              cf.netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600",
          },
        ]}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2 *:min-w-0">
        <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <h3 className="font-semibold">Cash Inflows</h3>
            <div className="-mx-4 -mb-4 sm:mx-0 sm:mb-0">
              <ReportTable
                labelHeader="Channel"
                rows={cf.inflowsByChannel}
                totalLabel="Total Cash Inflows"
                total={cf.totalInflows}
                amountClassName="text-emerald-600"
                emptyText="No cash inflows for this period"
                containerClassName="rounded-none sm:rounded-lg border-x-0 border-b-0 sm:border-x sm:border-b"
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-4 sm:p-6 flex flex-col gap-4">
            <h3 className="font-semibold">Cash Outflows</h3>
            <div className="-mx-4 -mb-4 sm:mx-0 sm:mb-0">
              <ReportTable
                labelHeader="Category"
                rows={cf.outflowsByCategory}
                totalLabel="Total Cash Outflows"
                total={cf.totalOutflows}
                amountClassName="text-rose-600"
                emptyText="No cash outflows for this period"
                containerClassName="rounded-none sm:rounded-lg border-x-0 border-b-0 sm:border-x sm:border-b"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-muted-foreground">
              Opening Balance
            </span>
            <span className="text-xl font-semibold">
              {formatCurrency(cf.openingBalance)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-muted-foreground">
              Net Cash Flow
            </span>
            <span
              className={cn(
                "text-xl font-semibold",
                cf.netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {formatCurrency(cf.netCashFlow)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-muted-foreground">
              Closing Balance
            </span>
            <span className="text-2xl font-bold">
              {formatCurrency(cf.closingBalance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CashFlowReport
