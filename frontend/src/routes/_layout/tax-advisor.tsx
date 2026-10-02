import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  TriangleAlert as AlertTriangle,
  Landmark,
  Loader as Loader2,
  RefreshCw,
} from "lucide-react-motion"
import { useState } from "react"

import { PossibleDeductionsTable } from "@/components/TaxAdvisor/PossibleDeductionsTable"
import { TaxAdvisorSummaryCards } from "@/components/TaxAdvisor/TaxAdvisorSummaryCards"
import { TaxPaymentDialog } from "@/components/TaxAdvisor/TaxPaymentDialog"
import { TaxRateReference } from "@/components/TaxAdvisor/TaxRateReference"
import { TaxSummaryTable } from "@/components/TaxAdvisor/TaxSummaryTable"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"
import {
  getTaxAdvisorAnalysis,
  getTaxAdvisorYears,
  getTaxRateBrackets,
} from "@/lib/taxAdvisor"

export const Route = createFileRoute("/_layout/tax-advisor")({
  component: TaxAdvisorRoute,
  head: () => ({
    meta: [
      {
        title: `AI Tax Advisor - ${APP_NAME}`,
      },
    ],
  }),
})

function TaxAdvisorRoute() {
  const companyId = useCurrentCompanyId() || ""
  const currentYear = new Date().getFullYear()

  // 1. Fetch available transaction years from backend
  const {
    data: availableYears = [],
    isLoading: isYearsLoading,
    refetch: refetchYears,
  } = useQuery({
    queryKey: ["taxAdvisorYears", companyId],
    queryFn: () => getTaxAdvisorYears(companyId),
    enabled: Boolean(companyId),
  })

  // Selected year state (default to latest available year or currentYear)
  const defaultYear =
    availableYears.length > 0 ? availableYears[0] : currentYear
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const yearToFetch = selectedYear ?? defaultYear

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)

  // 2. Fetch full Tax Advisor analysis for selected year
  const {
    data: analysisData,
    isLoading: isAnalysisLoading,
    isError: isAnalysisError,
    error: analysisError,
    refetch: refetchAnalysis,
  } = useQuery({
    queryKey: ["taxAdvisor", companyId, yearToFetch],
    queryFn: () => getTaxAdvisorAnalysis(companyId, yearToFetch),
    enabled: Boolean(companyId) && Boolean(yearToFetch),
  })

  // 3. Fetch tax rate brackets reference for selected year
  const { data: brackets = [] } = useQuery({
    queryKey: ["taxRateBrackets", companyId, yearToFetch],
    queryFn: () => getTaxRateBrackets(companyId, yearToFetch),
    enabled: Boolean(companyId) && Boolean(yearToFetch),
  })

  const isLoading = isYearsLoading || isAnalysisLoading

  return (
    <div className="flex flex-col gap-6">
      {/* Header with Title and Year Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Landmark className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-2xl tracking-tight">
              LHDN Tax Advisor
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Malaysian income tax position estimate &amp; deductible expense
            guidance based on recorded transactions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label
            htmlFor="tax-year-select"
            className="text-xs font-medium text-muted-foreground whitespace-nowrap"
          >
            Tax Year:
          </label>
          <Select
            value={String(yearToFetch)}
            onValueChange={(val) => setSelectedYear(Number(val))}
            disabled={isLoading || availableYears.length === 0}
          >
            <SelectTrigger
              id="tax-year-select"
              className="h-9 min-w-28 bg-background border-border font-semibold text-foreground"
            >
              <SelectValue placeholder="Tax Year" />
            </SelectTrigger>
            <SelectContent align="end">
              {availableYears.length > 0 ? (
                availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={String(currentYear)}>
                  {currentYear}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchYears()
              refetchAnalysis()
            }}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Warnings & Data Quality Banners */}
      {analysisData?.warnings && analysisData.warnings.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Tax Advisor Data Quality Notice</span>
          </div>
          <ul className="list-disc pl-5 text-xs space-y-1">
            {analysisData.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Loading / Error States */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          Calculating LHDN tax position for {yearToFetch}...
        </div>
      ) : isAnalysisError ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-16 text-center text-rose-700 dark:border-red-900 dark:bg-red-950 dark:text-rose-300">
          <AlertTriangle className="h-6 w-6" />
          <p className="font-semibold text-base">
            Could not calculate tax position
          </p>
          <p className="text-xs">
            {(analysisError as { detail?: string })?.detail ||
              "Please verify backend connection or select a different year."}
          </p>
        </div>
      ) : analysisData ? (
        <>
          {/* Top Summary Cards */}
          <TaxAdvisorSummaryCards
            data={analysisData}
            onRecordPaymentClick={() => setPaymentDialogOpen(true)}
          />

          {/* Possible Tax Deductions Table */}
          <PossibleDeductionsTable
            items={analysisData.deductions_by_category}
          />

          {/* Step-by-step Calculation Summary Table */}
          <TaxSummaryTable
            data={analysisData}
            companyId={companyId}
            onIncomeUpdated={() => refetchAnalysis()}
          />

          {/* Tax Rate Reference Accordion */}
          <TaxRateReference
            brackets={brackets}
            year={yearToFetch}
            taxpayerType={analysisData.taxpayer_type}
          />

          {/* Record Tax Payment Modal */}
          <TaxPaymentDialog
            open={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            companyId={companyId}
            year={yearToFetch}
            onPaymentSuccess={() => refetchAnalysis()}
          />
        </>
      ) : null}
    </div>
  )
}

export default TaxAdvisorRoute
