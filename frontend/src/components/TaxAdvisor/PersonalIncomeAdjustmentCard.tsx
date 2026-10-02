import {
  CircleCheck as CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader as Loader2,
  CircleX as XCircle,
} from "lucide-react-motion"
import { useEffect, useState } from "react"
import { CompaniesService } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, getAppCurrency } from "@/lib/currency"

interface PersonalIncomeAdjustmentCardProps {
  companyId: string
  businessChargeableIncome: number
  initialOtherIncome: number
  onIncomeUpdated: () => void
}

export function PersonalIncomeAdjustmentCard({
  companyId,
  businessChargeableIncome,
  initialOtherIncome,
  onIncomeUpdated,
}: PersonalIncomeAdjustmentCardProps) {
  const currency = getAppCurrency() || "RM"
  const paddingLeftPx = `${Math.max(44, currency.length * 12 + 20)}px`

  const [isOpen, setIsOpen] = useState(true)
  const [otherIncomeInput, setOtherIncomeInput] = useState<string>(
    initialOtherIncome > 0 ? String(initialOtherIncome) : "",
  )
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    setOtherIncomeInput(
      initialOtherIncome > 0 ? String(initialOtherIncome) : "",
    )
  }, [initialOtherIncome])

  const parsedOtherIncome = Math.max(0, Number(otherIncomeInput) || 0)
  const combinedTaxableIncome = businessChargeableIncome + parsedOtherIncome

  const handleSave = async (valueToSave: number) => {
    if (valueToSave < 0) {
      setErrorMsg("Amount cannot be negative.")
      return
    }
    setErrorMsg(null)
    setIsSaving(true)
    try {
      await CompaniesService.updateCompany({
        id: companyId,
        requestBody: {
          other_personal_taxable_income: valueToSave,
        },
      })
      onIncomeUpdated()
    } catch (err) {
      console.error("Failed to update personal income adjustment", err)
      setErrorMsg("Failed to save personal income. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleBlur = () => {
    const numericVal = Math.max(0, Number(otherIncomeInput) || 0)
    if (numericVal === 0 && otherIncomeInput !== "") {
      setOtherIncomeInput("")
    }
    if (numericVal !== initialOtherIncome) {
      handleSave(numericVal)
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Collapsible Card Header */}
      <div
        className="p-6 border-b flex items-center justify-between cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg tracking-tight">
              Personal Income Adjustment
            </h3>
            {isSaving && (
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Include taxable income earned outside of this business to improve
            your personal income tax estimation.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            setIsOpen(!isOpen)
          }}
          aria-label={isOpen ? "Collapse section" : "Expand section"}
        >
          {isOpen ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Card Content Body */}
      {isOpen && (
        <div className="p-6 flex flex-col gap-6">
          {/* Input Field */}
          <div className="flex flex-col gap-2 max-w-md">
            <label
              htmlFor="other-personal-income-input"
              className="text-sm font-medium text-foreground"
            >
              Estimated Annual Income from Other Sources ({currency})
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-sm font-medium text-muted-foreground select-none pointer-events-none z-10">
                {currency}
              </span>
              <Input
                id="other-personal-income-input"
                type="number"
                min="0"
                step="500"
                placeholder="Salary, rental income, freelance work, commissions, etc."
                style={{ paddingLeft: paddingLeftPx }}
                className="font-semibold"
                value={otherIncomeInput}
                onChange={(e) => {
                  setOtherIncomeInput(e.target.value)
                  if (errorMsg) setErrorMsg(null)
                }}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur()
                  }
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Do not include income generated by this business. This business's
              chargeable income has already been calculated above.
            </p>
            {errorMsg && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {errorMsg}
              </p>
            )}
          </div>

          {/* Information Panel */}
          <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Examples of income to include</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Employment salary</li>
                <li>Rental income</li>
                <li>Freelance work</li>
                <li>Director fees</li>
                <li>Commission income</li>
                <li>Income from another sole proprietorship</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>Do not include</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Income from this business</li>
                <li>Tax exempt income</li>
                <li>EPF withdrawals</li>
                <li>Capital gains not subject to Malaysian income tax</li>
              </ul>
            </div>
          </div>

          {/* Combined Income Summary Table */}
          <div className="flex flex-col gap-2">
            <h4 className="font-semibold text-sm text-foreground">
              Combined Income Summary
            </h4>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[65%]">Description</TableHead>
                    <TableHead className="text-right">
                      Amount ({currency})
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      Business Chargeable Income
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(businessChargeableIncome)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">
                      Other Personal Taxable Income
                    </TableCell>
                    <TableCell className="text-right font-medium text-blue-600 dark:text-blue-400">
                      {formatCurrency(parsedOtherIncome)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-indigo-50 dark:bg-indigo-950/40 font-bold border-t-2">
                    <TableCell className="text-indigo-900 dark:text-indigo-200">
                      Combined Taxable Income Used for Tax Calculation
                    </TableCell>
                    <TableCell className="text-right text-indigo-700 dark:text-indigo-300 text-base">
                      {formatCurrency(combinedTaxableIncome)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Disclaimer Note */}
          <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/50 p-3.5 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">Planning Estimate Only</span>
              <p className="leading-relaxed">
                Your business chargeable income has been calculated from the
                recorded transactions in this system. Additional income entered
                above is only used to estimate your overall Malaysian personal
                income tax position. Actual tax payable may differ depending on
                tax reliefs, rebates, deductions, residency status, and other
                personal circumstances.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
