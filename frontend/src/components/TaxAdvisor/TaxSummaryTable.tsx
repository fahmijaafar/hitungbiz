import { PersonalIncomeAdjustmentCard } from "@/components/TaxAdvisor/PersonalIncomeAdjustmentCard"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, getAppCurrency } from "@/lib/currency"
import type { TaxAdvisorAnalysis } from "@/lib/taxAdvisor"

interface TaxSummaryTableProps {
  data: TaxAdvisorAnalysis
  companyId: string
  onIncomeUpdated: () => void
}

export function TaxSummaryTable({
  data,
  companyId,
  onIncomeUpdated,
}: TaxSummaryTableProps) {
  const currency = getAppCurrency() || "RM"
  const isIndividualBusiness = data.taxpayer_type === "individual_business"
  const targetIncome = isIndividualBusiness
    ? (data.combined_taxable_income ?? data.chargeable_income)
    : data.chargeable_income

  return (
    <div className="flex flex-col gap-6">
      {/* Main Container Card for Calculation Summary */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-lg tracking-tight">
            Chargeable Income Calculation
          </h3>
          <p className="text-sm text-muted-foreground">
            Step-by-step reconciliation from accounting profit to LHDN estimated
            chargeable income.
          </p>
        </div>

        <div className="p-6">
          {/* Step 1: Reconciliation to Chargeable Income */}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[60%]">Calculation Step</TableHead>
                  <TableHead className="text-right">
                    Amount ({currency})
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Total Revenue</TableCell>
                  <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                    {formatCurrency(data.revenue)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground pl-6">
                    (−) Total Accounting Expenses
                  </TableCell>
                  <TableCell className="text-right text-rose-600 dark:text-rose-400">
                    −{formatCurrency(data.expenses)}
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell>= Profit Before Tax (PBT)</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(data.profit_before_tax)}
                  </TableCell>
                </TableRow>

                {/* Tax Adjustments Header */}
                <TableRow className="bg-muted/10">
                  <TableCell
                    colSpan={2}
                    className="font-medium text-xs text-muted-foreground uppercase tracking-wider"
                  >
                    Tax Adjustments &amp; Allowances
                  </TableCell>
                </TableRow>
                {data.non_deductible_expenses > 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground pl-6">
                      (+) Non-Deductible Expenses Add-Back
                    </TableCell>
                    <TableCell className="text-right text-amber-600">
                      +{formatCurrency(data.non_deductible_expenses)}
                    </TableCell>
                  </TableRow>
                )}
                {data.conditional_expenses > 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground pl-6">
                      (+) Conditional Expenses (Requires Review)
                    </TableCell>
                    <TableCell className="text-right text-amber-600">
                      +{formatCurrency(data.conditional_expenses)}
                    </TableCell>
                  </TableRow>
                )}
                {data.capital_allowance_details.length > 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground pl-6">
                      (+) Fixed Asset Purchase Costs Capitalized
                    </TableCell>
                    <TableCell className="text-right text-amber-600">
                      +
                      {formatCurrency(
                        data.capital_allowance_details.reduce(
                          (s, c) => s + c.purchase_cost,
                          0,
                        ),
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {data.capital_allowance > 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground pl-6">
                      (−) Eligible Capital Allowances (IA + AA)
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      −{formatCurrency(data.capital_allowance)}
                    </TableCell>
                  </TableRow>
                )}

                <TableRow className="bg-emerald-50 dark:bg-emerald-950/40 font-bold border-t-2">
                  <TableCell>= Estimated Business Chargeable Income</TableCell>
                  <TableCell className="text-right text-emerald-700 dark:text-emerald-300 text-base">
                    {formatCurrency(data.chargeable_income)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* NEW: Personal Income Adjustment (Sole Proprietorship / Enterprise only) */}
      {isIndividualBusiness && (
        <PersonalIncomeAdjustmentCard
          companyId={companyId}
          businessChargeableIncome={data.chargeable_income}
          initialOtherIncome={data.other_personal_taxable_income || 0}
          onIncomeUpdated={onIncomeUpdated}
        />
      )}

      {/* Step 2: Progressive Income Tax Calculation */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="p-6 border-b">
          <h3 className="font-semibold text-lg tracking-tight">
            Progressive Income Tax Calculation ({data.tax_year})
          </h3>
          <p className="text-sm text-muted-foreground">
            {isIndividualBusiness
              ? "Calculated based on Combined Taxable Income (Business Chargeable Income + Other Personal Income)."
              : "Calculated based on Business Chargeable Income."}
          </p>
        </div>

        <div className="p-6">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Chargeable Income Bracket</TableHead>
                  <TableHead className="text-center">Tax Rate</TableHead>
                  <TableHead className="text-right">Taxable Amount</TableHead>
                  <TableHead className="text-right">Tax Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tax_brackets.map((b) => {
                  const isApplicable =
                    b.taxable_amount > 0 ||
                    (b.min_amount === 0 && targetIncome >= 0)
                  if (!isApplicable && b.min_amount > targetIncome) {
                    return null // Only display applicable brackets
                  }
                  return (
                    <TableRow
                      key={b.bracket}
                      className={
                        b.taxable_amount > 0
                          ? "font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      <TableCell>{b.bracket}</TableCell>
                      <TableCell className="text-center">{b.rate}%</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(b.taxable_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(b.tax)}
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-amber-50 dark:bg-amber-950/40 font-bold border-t-2">
                  <TableCell colSpan={3}>Total Estimated Tax Payable</TableCell>
                  <TableCell className="text-right text-amber-700 dark:text-amber-300 text-base">
                    {formatCurrency(data.estimated_tax_payable)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground pl-6">
                    (−) Total Tax Paid (CP500 / Installments)
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    −{formatCurrency(data.tax_paid)}
                  </TableCell>
                </TableRow>
                <TableRow className="bg-indigo-50 dark:bg-indigo-950/40 font-bold border-t text-base">
                  <TableCell colSpan={3}>
                    {data.overpaid_amount > 0
                      ? "Estimated Overpayment"
                      : "Estimated Tax Remaining"}
                  </TableCell>
                  <TableCell className="text-right text-indigo-700 dark:text-indigo-300">
                    {data.overpaid_amount > 0
                      ? formatCurrency(data.overpaid_amount)
                      : formatCurrency(data.tax_remaining)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
