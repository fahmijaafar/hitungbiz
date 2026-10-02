import type {
  BankAccountPublic,
  DocumentPublic,
  ProductPublic,
  PurchasePublic,
  SalePublic,
} from "@/client"

export type AmountRow = { label: string; amount: number }

/** Inclusive date range, both bounds formatted as YYYY-MM-DD. */
export type DateRange = { start: string; end: string }

export type PeriodPreset =
  | "this_week"
  | "last_7_days"
  | "month_to_date"
  | "last_6_months"
  | "last_12_months"
  | "year_to_date"
  | "all_time"

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function getDashboardDateRange(period: PeriodPreset) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let startDate: string | null = null
  let endDate: string | null = formatLocalDate(today)

  if (period === "this_week") {
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())
    startDate = formatLocalDate(startOfWeek)
  } else if (period === "last_7_days") {
    const start = new Date(today)
    start.setDate(today.getDate() - 7)
    startDate = formatLocalDate(start)
  } else if (period === "month_to_date") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    startDate = formatLocalDate(start)
  } else if (period === "last_6_months") {
    const start = new Date(today)
    start.setMonth(today.getMonth() - 6)
    startDate = formatLocalDate(start)
  } else if (period === "last_12_months") {
    const start = new Date(today)
    start.setMonth(today.getMonth() - 12)
    startDate = formatLocalDate(start)
  } else if (period === "year_to_date") {
    const start = new Date(today.getFullYear(), 0, 1)
    startDate = formatLocalDate(start)
  } else {
    startDate = null
    endDate = null
  }

  return { startDate, endDate }
}

export function isDateInRange(
  dateStr: string | null | undefined,
  startDate: string | null,
  endDate: string | null,
) {
  if (!dateStr) return false
  const normalized = dateStr.slice(0, 10)
  if (startDate && normalized < startDate) return false
  if (endDate && normalized > endDate) return false
  return true
}

// Statuses that count as actual cash received / paid out.
const PAID_STATUSES = new Set(["paid", "completed", "processed"])

// Statuses that count as still outstanding (used for AR / AP).
const OUTSTANDING_STATUSES = new Set([
  "pending",
  "partially paid",
  "overdue",
  "unpaid",
  "new",
])

export function isPaidStatus(status?: string | null): boolean {
  return PAID_STATUSES.has((status ?? "").trim().toLowerCase())
}

export function isOutstandingStatus(status?: string | null): boolean {
  return OUTSTANDING_STATUSES.has((status ?? "").trim().toLowerCase())
}

function inRange(
  dateStr: string | null | undefined,
  range: DateRange,
): boolean {
  if (!dateStr) return false
  const d = dateStr.slice(0, 10)
  return d >= range.start && d <= range.end
}

export function filterByRange<T extends { date?: string | null }>(
  items: T[],
  range: DateRange,
): T[] {
  return items.filter((i) => inRange(i.date, range))
}

function groupSum(entries: { key: string; amount: number }[]): AmountRow[] {
  const map = new Map<string, number>()
  for (const e of entries) {
    map.set(e.key, (map.get(e.key) ?? 0) + e.amount)
  }
  return Array.from(map, ([label, amount]) => ({ label, amount })).sort(
    (a, b) => b.amount - a.amount,
  )
}

/** Final total for an invoice document, read from its price_calculation blob. */
export function getInvoiceTotal(doc: DocumentPublic): number {
  const calc = doc.price_calculation
  if (!calc || typeof calc !== "object") return 0
  return Number((calc as Record<string, unknown>).final_total ?? 0)
}

export type ProfitLoss = {
  revenueByChannel: AmountRow[]
  expensesByCategory: AmountRow[]
  totalRevenue: number
  totalExpenses: number
  netProfit: number
}

export function buildProfitLoss(
  sales: SalePublic[],
  purchases: PurchasePublic[],
  range: DateRange,
): ProfitLoss {
  const rangeSales = filterByRange(sales, range).filter(
    (sale) => sale.status === "Completed",
  )
  const rangePurchases = filterByRange(purchases, range).filter(
    (purchase) => purchase.status === "Paid",
  )

  const revenueByChannel = groupSum(
    rangeSales.map((s) => ({
      key: s.channel || "Unknown",
      amount: Number(s.final_amount ?? 0),
    })),
  )
  const expensesByCategory = groupSum(
    rangePurchases.map((p) => ({
      key: p.category || "Uncategorized",
      amount: Number(p.final_amount ?? 0),
    })),
  )
  const totalRevenue = revenueByChannel.reduce((s, r) => s + r.amount, 0)
  const totalExpenses = expensesByCategory.reduce((s, r) => s + r.amount, 0)

  return {
    revenueByChannel,
    expensesByCategory,
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
  }
}

export type BalanceSheet = {
  cashRows: AmountRow[]
  totalCash: number
  accountsReceivable: number
  inventoryValue: number
  totalAssets: number
  accountsPayable: number
  totalLiabilities: number
  equity: number
  totalLiabilitiesAndEquity: number
}

export function buildBalanceSheet(
  banks: BankAccountPublic[],
  documents: DocumentPublic[],
  products: ProductPublic[],
  purchases: PurchasePublic[],
  netProfit: number,
): BalanceSheet {
  const cashRows: AmountRow[] = banks.map((b) => ({
    label: b.account_name || b.bank_name,
    amount: Number(b.opening_balance ?? 0),
  }))
  const totalCash = cashRows.reduce((s, r) => s + r.amount, 0)

  const accountsReceivable = documents
    .filter((d) => d.doctype === "invoice" && isOutstandingStatus(d.status))
    .reduce((s, d) => s + getInvoiceTotal(d), 0)

  const inventoryValue = products.reduce(
    (s, p) => s + Number(p.cost_price ?? 0) * Number(p.stock_quantity ?? 0),
    0,
  )

  const totalAssets = totalCash + accountsReceivable + inventoryValue

  const accountsPayable = purchases
    .filter((p) => isOutstandingStatus(p.status))
    .reduce((s, p) => s + Number(p.final_amount ?? 0), 0)

  const totalLiabilities = accountsPayable
  const equity = netProfit

  return {
    cashRows,
    totalCash,
    accountsReceivable,
    inventoryValue,
    totalAssets,
    accountsPayable,
    totalLiabilities,
    equity,
    totalLiabilitiesAndEquity: totalLiabilities + equity,
  }
}

export type CashFlow = {
  inflowsByChannel: AmountRow[]
  outflowsByCategory: AmountRow[]
  totalInflows: number
  totalOutflows: number
  netCashFlow: number
  openingBalance: number
  closingBalance: number
}

export function buildCashFlow(
  sales: SalePublic[],
  purchases: PurchasePublic[],
  banks: BankAccountPublic[],
  range: DateRange,
): CashFlow {
  const paidSales = filterByRange(sales, range).filter((s) =>
    isPaidStatus(s.status),
  )
  const paidPurchases = filterByRange(purchases, range).filter((p) =>
    isPaidStatus(p.status),
  )

  const inflowsByChannel = groupSum(
    paidSales.map((s) => ({
      key: s.channel || "Unknown",
      amount: Number(s.final_amount ?? 0),
    })),
  )
  const outflowsByCategory = groupSum(
    paidPurchases.map((p) => ({
      key: p.category || "Uncategorized",
      amount: Number(p.final_amount ?? 0),
    })),
  )

  const totalInflows = inflowsByChannel.reduce((s, r) => s + r.amount, 0)
  const totalOutflows = outflowsByCategory.reduce((s, r) => s + r.amount, 0)
  const netCashFlow = totalInflows - totalOutflows

  // Best available opening cash position: sum of recorded bank balances.
  const openingBalance = banks.reduce(
    (s, b) => s + Number(b.opening_balance ?? 0),
    0,
  )

  return {
    inflowsByChannel,
    outflowsByCategory,
    totalInflows,
    totalOutflows,
    netCashFlow,
    openingBalance,
    closingBalance: openingBalance + netCashFlow,
  }
}

/** Default range: from the first day of the current year through today. */
export function getDefaultDateRange(): DateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`
  return { start: toIso(start), end: toIso(now) }
}
