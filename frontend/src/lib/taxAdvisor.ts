import { TaxAdvisorService } from "@/client"

export type CapitalAllowanceDetail = {
  purchase_id: string | null
  asset: string
  purchase_date: string
  purchase_cost: number
  asset_class: string
  initial_allowance_rate: number
  annual_allowance_rate: number
  initial_allowance: number
  annual_allowance: number
  total_allowance: number
  remaining_qualifying_expenditure: number
  review_warning?: string | null
}

export type ExpenseCategoryDeduction = {
  category: string
  total_recorded: number
  tax_treatment:
    | "deductible"
    | "conditional"
    | "non_deductible"
    | "capital_allowance"
    | "prepayment"
    | "deposit"
    | "owner_drawing"
    | string
  estimated_deductible: number
  requires_review: boolean
  notes?: string | null
}

export type TaxBracketBreakdown = {
  bracket: string
  min_amount: number
  max_amount: number | null
  taxable_amount: number
  rate: number
  tax: number
}

export type TaxAdvisorAnalysis = {
  company_id: string
  tax_year: number
  taxpayer_type: string

  revenue: number
  expenses: number
  profit_before_tax: number

  deductible_expenses: number
  conditional_expenses: number
  non_deductible_expenses: number
  capital_allowance: number
  tax_adjustments: number

  chargeable_income: number
  other_personal_taxable_income: number
  combined_taxable_income: number
  estimated_tax_payable: number
  effective_tax_rate: number
  marginal_tax_rate: number

  tax_paid: number
  tax_remaining: number
  overpaid_amount: number

  tax_brackets: TaxBracketBreakdown[]
  deductions_by_category: ExpenseCategoryDeduction[]
  capital_allowance_details: CapitalAllowanceDetail[]
  requires_review: string[]
  warnings: string[]
}

export type TaxPayment = {
  id: string
  company_id: string
  tax_year: number
  payment_date: string
  amount: number
  payment_type: string
  reference?: string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type TaxPaymentsPublic = {
  data: TaxPayment[]
  count: number
}

export type TaxRateBracket = {
  id: string
  tax_rule_set_id: string
  sequence: number
  min_amount: number
  max_amount: number | null
  rate: number
  description: string
}

/** Get available transaction years for a company. */
export function getTaxAdvisorYears(companyId: string) {
  return TaxAdvisorService.readTaxAdvisorYears({
    companyId,
  }) as Promise<number[]>
}

/** Get full Tax Advisor analysis for a specific year. */
export function getTaxAdvisorAnalysis(companyId: string, year: number) {
  return TaxAdvisorService.readTaxAdvisorAnalysis({
    companyId,
    year,
  }) as Promise<TaxAdvisorAnalysis>
}

/** Get tax rate brackets reference for a specific year. */
export function getTaxRateBrackets(companyId: string, year: number) {
  return TaxAdvisorService.readTaxRateBrackets({
    companyId,
    year,
  }) as Promise<TaxRateBracket[]>
}

/** Get recorded tax payments for a specific year. */
export function getTaxPayments(companyId: string, year: number) {
  return TaxAdvisorService.readTaxPayments({
    companyId,
    year,
  }) as Promise<TaxPaymentsPublic>
}

export type RecordTaxPaymentRequest = {
  payment_date: string
  amount: number
  payment_type?: string
  reference?: string
  notes?: string
}

/** Record a tax payment for a specific year. */
export function recordTaxPayment(
  companyId: string,
  year: number,
  data: RecordTaxPaymentRequest,
) {
  return TaxAdvisorService.createTaxPayment({
    companyId,
    year,
    requestBody: {
      company_id: companyId,
      tax_year: year,
      payment_date: data.payment_date,
      amount: data.amount,
      payment_type: data.payment_type || "cp500",
      reference: data.reference || null,
      notes: data.notes || null,
    },
  }) as Promise<TaxPayment>
}

/** Delete a recorded tax payment. */
export function deleteTaxPayment(
  companyId: string,
  year: number,
  paymentId: string,
) {
  return TaxAdvisorService.deleteTaxPayment({
    companyId,
    year,
    paymentId,
  })
}
