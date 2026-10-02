import { useQueries } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  TriangleAlert as AlertTriangle,
  ChartNoAxesColumn as FileBarChart,
  Loader as Loader2,
  Printer,
} from "lucide-react-motion"
import { useState } from "react"
import {
  BankAccountsService,
  CompaniesService,
  DocumentsService,
  ProductsService,
  PurchasesService,
  SalesService,
} from "@/client"
import BalanceSheetReport from "@/components/Reports/BalanceSheetReport"
import CashFlowReport from "@/components/Reports/CashFlowReport"
import ProfitLossReport from "@/components/Reports/ProfitLossReport"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"
import {
  buildBalanceSheet,
  buildCashFlow,
  buildProfitLoss,
  getDefaultDateRange,
} from "@/lib/reports"
import {
  type FinancialReportType,
  printFinancialReport,
} from "@/lib/templates/financialReportTemplate"

export const Route = createFileRoute("/_layout/financial-reports")({
  component: FinancialReports,
  head: () => ({
    meta: [
      {
        title: `Financial Reports - ${APP_NAME}`,
      },
    ],
  }),
})

const TAB_LABELS: Record<string, string> = {
  "profit-loss": "Profit & Loss",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow Statement",
}

function FinancialReports() {
  const companyId = useCurrentCompanyId()
  const defaults = getDefaultDateRange()
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd] = useState(defaults.end)
  const [activeTab, setActiveTab] = useState("profit-loss")

  const range = { start, end }

  const results = useQueries({
    queries: [
      {
        queryKey: ["sales", companyId],
        queryFn: () =>
          SalesService.readSales({ skip: 0, limit: 1000, companyId }),
      },
      {
        queryKey: ["purchases", companyId],
        queryFn: () =>
          PurchasesService.readPurchases({ skip: 0, limit: 1000, companyId }),
      },
      {
        queryKey: ["documents", companyId],
        queryFn: () =>
          DocumentsService.readDocuments({ skip: 0, limit: 1000, companyId }),
      },
      {
        queryKey: ["products", companyId],
        queryFn: () =>
          ProductsService.readProducts({ skip: 0, limit: 1000, companyId }),
      },
      {
        queryKey: ["bank_accounts", companyId],
        queryFn: () =>
          BankAccountsService.readBankAccounts({
            skip: 0,
            limit: 1000,
            companyId,
          }),
      },
      {
        queryKey: ["company", companyId],
        queryFn: () => CompaniesService.readCompany({ id: companyId ?? "" }),
        enabled: !!companyId,
      },
    ],
  })

  const isLoading = results.some((r) => r.isLoading)
  const isError = results.some((r) => r.isError)

  const [salesQ, purchasesQ, documentsQ, productsQ, banksQ, companyQ] = results
  const sales = salesQ.data?.data ?? []
  const purchases = purchasesQ.data?.data ?? []
  const documents = documentsQ.data?.data ?? []
  const products = productsQ.data?.data ?? []
  const banks = banksQ.data?.data ?? []
  const company = companyQ?.data ?? null

  const formattedRange = `${start} to ${end}`

  const handleExportPDF = () => {
    const reportType = activeTab as FinancialReportType
    if (reportType === "profit-loss") {
      const pl = buildProfitLoss(sales, purchases, range)
      printFinancialReport({
        type: "profit-loss",
        company,
        range,
        profitLoss: pl,
      })
    } else if (reportType === "balance-sheet") {
      const { netProfit } = buildProfitLoss(sales, purchases, range)
      const bs = buildBalanceSheet(
        banks,
        documents,
        products,
        purchases,
        netProfit,
      )
      printFinancialReport({
        type: "balance-sheet",
        company,
        range,
        balanceSheet: bs,
      })
    } else if (reportType === "cash-flow") {
      const cf = buildCashFlow(sales, purchases, banks, range)
      printFinancialReport({
        type: "cash-flow",
        company,
        range,
        cashFlow: cf,
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 no-print md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-2xl tracking-tight">
              Financial Reports
            </h1>
          </div>
          <p className="text-muted-foreground">
            Profit &amp; loss, balance sheet and cash flow reports
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-start" className="text-xs">
              From
            </Label>
            <DateInput
              id="report-start"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="report-end" className="text-xs">
              To
            </Label>
            <DateInput
              id="report-end"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={isLoading || isError}
          >
            <Printer className="mr-2 h-4 w-4" />
            Export to PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading financial data...
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-16 text-center text-rose-700 dark:border-red-900 dark:bg-red-950 dark:text-rose-300">
          <AlertTriangle className="h-6 w-6" />
          <p className="font-medium">Could not load financial data</p>
          <p className="text-sm">Please refresh the page and try again.</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="no-print">
            <TabsTrigger value="profit-loss">Profit &amp; Loss</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
            <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
          </TabsList>

          <div id="report-print-area" className="mt-4">
            <div className="mb-4 hidden print:block">
              <h2 className="text-xl font-bold">{TAB_LABELS[activeTab]}</h2>
              <p className="text-sm text-muted-foreground">{formattedRange}</p>
            </div>

            <TabsContent value="profit-loss">
              <ProfitLossReport
                sales={sales}
                purchases={purchases}
                range={range}
              />
            </TabsContent>
            <TabsContent value="balance-sheet">
              <BalanceSheetReport
                sales={sales}
                purchases={purchases}
                documents={documents}
                products={products}
                banks={banks}
                range={range}
              />
            </TabsContent>
            <TabsContent value="cash-flow">
              <CashFlowReport
                sales={sales}
                purchases={purchases}
                banks={banks}
                range={range}
              />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  )
}

export default FinancialReports
