import {
  Calculator,
  CreditCard,
  DollarSign,
  Info,
  CirclePlus as PlusCircle,
  TrendingUp,
} from "lucide-react-motion"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCurrency } from "@/lib/currency"
import type { TaxAdvisorAnalysis } from "@/lib/taxAdvisor"

interface TaxAdvisorSummaryCardsProps {
  data: TaxAdvisorAnalysis
  onRecordPaymentClick: () => void
}

export function TaxAdvisorSummaryCards({
  data,
  onRecordPaymentClick,
}: TaxAdvisorSummaryCardsProps) {
  return (
    <TooltipProvider>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CARD 1: Estimated Tax Payable */}
        <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Estimated Tax Payable
            </span>
            <Calculator className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {formatCurrency(data.estimated_tax_payable)}
            </span>
            <p className="text-xs text-muted-foreground">
              {data.other_personal_taxable_income > 0
                ? "Based on combined taxable income"
                : "Estimated based on recorded transactions"}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t text-xs flex justify-between text-muted-foreground">
            <span>Effective Rate:</span>
            <span className="font-semibold text-foreground">
              {data.effective_tax_rate.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* CARD 2: Profit Before Tax */}
        <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">
                Profit Before Tax
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center">
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Accounting profit based on transactions recorded in the
                  database (Revenue − Expenses).
                </TooltipContent>
              </Tooltip>
            </div>
            <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <span className="text-2xl font-bold tracking-tight">
              {formatCurrency(data.profit_before_tax)}
            </span>
            <p className="text-xs text-muted-foreground">Revenue − Expenses</p>
          </div>
          <div className="mt-4 pt-3 border-t text-xs flex justify-between text-muted-foreground">
            <span>Revenue / Expenses:</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(data.revenue)} / {formatCurrency(data.expenses)}
            </span>
          </div>
        </div>

        {/* CARD 3: Estimated Chargeable Income */}
        <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">
                Chargeable Income
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center">
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  This is an estimate based on recorded transactions and may
                  differ from your final LHDN filing.
                </TooltipContent>
              </Tooltip>
            </div>
            <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <span className="text-2xl font-bold tracking-tight">
              {formatCurrency(data.chargeable_income)}
            </span>
            <p className="text-xs text-muted-foreground">
              After tax adjustments &amp; allowances
            </p>
          </div>
          <div className="mt-4 pt-3 border-t text-xs flex justify-between text-muted-foreground">
            <span>Marginal Bracket:</span>
            <span className="font-semibold text-foreground">
              {data.marginal_tax_rate}%
            </span>
          </div>
        </div>

        {/* CARD 4: Tax Remaining / Paid */}
        <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Tax Remaining
            </span>
            <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {data.overpaid_amount > 0 ? (
              <>
                <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(data.overpaid_amount)}
                </span>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Estimated Overpayment
                </p>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(data.tax_remaining)}
                </span>
                <p className="text-xs text-muted-foreground">
                  Estimated Tax {formatCurrency(data.estimated_tax_payable)} −
                  Paid {formatCurrency(data.tax_paid)}
                </p>
              </>
            )}
          </div>
          <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Paid:{" "}
              <strong className="text-foreground">
                {formatCurrency(data.tax_paid)}
              </strong>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={onRecordPaymentClick}
            >
              <PlusCircle className="mr-1 h-3.5 w-3.5 text-primary" />
              Record Payment
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
