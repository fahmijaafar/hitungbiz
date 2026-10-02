import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  List,
  TrendingDown,
  TrendingUp,
} from "lucide-react-motion"
import { useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { PurchasesService, SalesService } from "@/client"
import { DashboardService } from "@/client/sdk.gen"
import AIFinancialSummary from "@/components/Common/AIFinancialSummary"
import { MobileTransactionList } from "@/components/Transactions/MobileTransactionList"
import type { Transaction } from "@/components/Transactions/TransactionColumn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useAuth from "@/hooks/useAuth"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { useIsMobile } from "@/hooks/useMobile"
import { APP_NAME } from "@/lib/app"
import { formatCurrency, getAppCurrency } from "@/lib/currency"
import {
  getDashboardDateRange,
  isDateInRange,
  type PeriodPreset,
} from "@/lib/reports"
import { cn, formatDateDMY } from "@/lib/utils"

function getCardValueFontSizeClass(valueStr: string) {
  const len = valueStr.length
  if (len >= 16) {
    return "text-xs sm:text-sm md:text-lg lg:text-xl tracking-tighter"
  }
  if (len >= 13) {
    return "text-sm sm:text-base md:text-xl lg:text-2xl tracking-tight"
  }
  if (len >= 10) {
    return "text-base sm:text-lg md:text-xl lg:text-2xl tracking-tight"
  }
  return "text-lg sm:text-xl md:text-2xl"
}

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: `Dashboard - ${APP_NAME}`,
      },
    ],
  }),
})

function TopAmountList({
  title,
  rows,
  accent,
  emptyText,
  timeframeLabel,
}: {
  title: string
  rows: { name: string; total: number }[]
  accent: "revenue" | "expense"
  emptyText: string
  timeframeLabel: string
}) {
  const totalAmount = rows.reduce((sum, row) => sum + row.total, 0)
  const formattedTotal = formatCurrency(totalAmount)

  const totalFontSizeClass = useMemo(() => {
    if (formattedTotal.length > 16) return "text-xs font-semibold"
    if (formattedTotal.length > 12) return "text-sm font-semibold"
    return "text-base sm:text-lg font-semibold"
  }, [formattedTotal])

  const colors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ef4444",
    "#14b8a6",
  ]

  return (
    <div className="min-w-0 rounded-xl border bg-card text-card-foreground shadow">
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-semibold">{title}</h3>
          <span className="text-sm text-muted-foreground">
            {timeframeLabel}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-muted-foreground">{emptyText}</span>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
            <div className="relative h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rows}
                    dataKey="total"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={86}
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    {rows.map((row, index) => (
                      <Cell
                        key={`cell-${row.name}`}
                        fill={colors[index % colors.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <span className="text-xs text-muted-foreground">Total</span>
                <span
                  className={cn(
                    "tracking-tight whitespace-nowrap",
                    totalFontSizeClass,
                  )}
                >
                  {formattedTotal}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {rows.map((row, index) => {
                const percentage = totalAmount
                  ? Math.round((row.total / totalAmount) * 100)
                  : 0
                return (
                  <div
                    key={row.name}
                    className="flex items-center justify-between rounded-2xl border border-border bg-surface/80 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{
                          backgroundColor: colors[index % colors.length],
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {percentage}%
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        accent === "revenue"
                          ? "text-emerald-600"
                          : "text-rose-600",
                      )}
                    >
                      {formatCurrency(row.total)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatMonthAbbr(monthStr: string) {
  if (!monthStr) return ""
  const [year, month] = monthStr.split("-")
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const monthIndex = Number.parseInt(month, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return monthStr
  return `${months[monthIndex]} '${year.slice(2)}`
}

function formatDayAbbr(dayStr: string) {
  if (!dayStr || dayStr.length < 10) return dayStr
  const [year, month, day] = dayStr.split("-")
  const date = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
  )
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return `${days[date.getDay()]} ${Number.parseInt(day, 10)}`
}

function formatCompactNumber(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  }
  if (abs >= 1_000) {
    return `${(val / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  }
  return `${Math.round(val)}`
}

const DASHBOARD_PERIOD_KEY = "dashboard_period"

function Dashboard() {
  const { user: currentUser } = useAuth()
  const companyId = useCurrentCompanyId()
  const isMobile = useIsMobile()
  const [period, setPeriod] = useState<PeriodPreset>(() => {
    if (typeof window === "undefined") return "last_6_months"
    return (
      (localStorage.getItem(DASHBOARD_PERIOD_KEY) as PeriodPreset | null) ||
      "last_6_months"
    )
  })

  useEffect(() => {
    localStorage.setItem(DASHBOARD_PERIOD_KEY, period)
  }, [period])

  const { startDate, endDate } = getDashboardDateRange(period)

  const queryParams = useMemo(
    () => ({
      period: period,
      startDate: startDate,
      endDate: endDate,
    }),
    [period, startDate, endDate],
  )

  const { data: chartData, isLoading } = useQuery({
    queryKey: ["dashboardChart", companyId, queryParams],
    queryFn: () =>
      DashboardService.readDashboardChart({
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
        period: queryParams.period,
      }),
  })

  const mergedChartData = useMemo(() => {
    if (!chartData?.sales_overview || !chartData?.purchases_overview) return []
    const salesMap = new Map<string, number>()
    const purchasesMap = new Map<string, number>()
    for (const point of chartData.sales_overview) {
      if (point.month) salesMap.set(point.month, point.total ?? 0)
    }
    for (const point of chartData.purchases_overview) {
      if (point.month) purchasesMap.set(point.month, point.total ?? 0)
    }
    const allKeys = new Set([...salesMap.keys(), ...purchasesMap.keys()])
    const keysArray = Array.from(allKeys).sort()
    // Detect daily granularity (keys are YYYY-MM-DD = 10 chars) vs monthly (YYYY-MM = 7 chars)
    const isDaily = keysArray.length > 0 && keysArray[0].length === 10
    return keysArray.map((key) => ({
      month: isDaily ? formatDayAbbr(key) : formatMonthAbbr(key),
      sales: salesMap.get(key) ?? 0,
      purchases: purchasesMap.get(key) ?? 0,
    }))
  }, [chartData])

  const totalRevenue = chartData?.total_revenue ?? 0
  const totalExpenses = chartData?.total_expenses ?? 0
  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  const profitMarginData = useMemo(() => {
    const marginVal = Math.max(0, Math.min(profitMargin, 100))
    return [
      { name: "Profit Margin", value: marginVal },
      { name: "Remaining", value: 100 - marginVal },
    ]
  }, [profitMargin])

  const { data: salesData } = useQuery({
    queryFn: () => SalesService.readSales({ skip: 0, limit: 100, companyId }),
    queryKey: ["sales", companyId],
  })

  const { data: purchasesData } = useQuery({
    queryFn: () =>
      PurchasesService.readPurchases({ skip: 0, limit: 100, companyId }),
    queryKey: ["purchases", companyId],
  })

  const totalRecords = useMemo(() => {
    const salesCount = (salesData?.data ?? []).filter((sale) =>
      isDateInRange(sale.date, startDate, endDate),
    ).length
    const purchasesCount = (purchasesData?.data ?? []).filter((purchase) =>
      isDateInRange(purchase.date, startDate, endDate),
    ).length
    return salesCount + purchasesCount
  }, [salesData, purchasesData, startDate, endDate])

  const topRevenueByChannel = useMemo(() => {
    const totals = new Map<string, number>()
    for (const sale of salesData?.data ?? []) {
      if (sale.status !== "Completed") continue
      if (!isDateInRange(sale.date, startDate, endDate)) continue
      const key = sale.channel || "Unknown"
      totals.set(key, (totals.get(key) ?? 0) + Number(sale.final_amount ?? 0))
    }
    return Array.from(totals, ([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [salesData, startDate, endDate])

  const topExpensesByChannel = useMemo(() => {
    const totals = new Map<string, number>()
    for (const purchase of purchasesData?.data ?? []) {
      if (purchase.status !== "Paid") continue
      if (!isDateInRange(purchase.date, startDate, endDate)) continue
      const key = purchase.category || "Uncategorized"
      totals.set(
        key,
        (totals.get(key) ?? 0) + Number(purchase.final_amount ?? 0),
      )
    }
    return Array.from(totals, ([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [purchasesData, startDate, endDate])

  const recentTransactions = useMemo<Transaction[]>(() => {
    const sales = (salesData?.data ?? []).map((sale) => ({
      id: `sale-${sale.id}`,
      sourceType: "sale" as const,
      sourceId: sale.id,
      date: sale.date ?? "",
      title: sale.notes || "Sale",
      detail: sale.channel,
      amount: Number(sale.final_amount ?? 0),
      direction: "revenue" as const,
      status: sale.status,
      notes: sale.notes,
      channel: sale.channel,
    }))
    const purchases = (purchasesData?.data ?? []).map((purchase) => ({
      id: `purchase-${purchase.id}`,
      sourceType: "purchase" as const,
      sourceId: purchase.id,
      date: purchase.date,
      title: purchase.supplier_name,
      detail: purchase.category,
      amount: -Number(purchase.final_amount ?? 0),
      direction: "expense" as const,
      status: purchase.status,
      notes: purchase.notes,
      supplierName: purchase.supplier_name,
      category: purchase.category,
    }))
    return [...sales, ...purchases]
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 10)
  }, [salesData, purchasesData])

  const periodLabel = useMemo(() => {
    if (period === "this_week") return "This Week"
    if (period === "last_7_days") return "Last 7 Days"
    if (period === "month_to_date") return "Month to Date"
    if (period === "all_time") return "All Time"
    if (period === "year_to_date") return "Year to Date"
    if (period === "last_12_months") return "Last 12 Months"
    if (period === "last_6_months") return "Last 6 Months"
    return "Last 6 Months"
  }, [period])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl truncate max-w-sm">
            Hi, {currentUser?.full_name || currentUser?.email} 👋
          </h1>
          <p className="text-muted-foreground">
            Here's your business performance at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          <Select
            value={period}
            onValueChange={(val) => setPeriod(val as PeriodPreset)}
          >
            <SelectTrigger className="w-40 h-9 bg-background border-border font-medium text-foreground">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_7_days">Last 7 Days</SelectItem>
              <SelectItem value="month_to_date">Month to Date</SelectItem>
              <SelectItem value="last_6_months">Last 6 Months</SelectItem>
              <SelectItem value="last_12_months">Last 12 Months</SelectItem>
              <SelectItem value="year_to_date">Year to Date</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                Total Revenue
              </h3>
              <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
            </div>
            <div
              className={cn(
                "font-bold truncate overflow-hidden",
                getCardValueFontSizeClass(
                  isLoading ? "" : formatCurrency(totalRevenue),
                ),
              )}
            >
              {isLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                formatCurrency(totalRevenue)
              )}
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                Total Expenses
              </h3>
              <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" />
            </div>
            <div
              className={cn(
                "font-bold truncate overflow-hidden",
                getCardValueFontSizeClass(
                  isLoading ? "" : formatCurrency(totalExpenses),
                ),
              )}
            >
              {isLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                formatCurrency(totalExpenses)
              )}
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                {netProfit >= 0 ? "Net Profit" : "Net Loss"}
              </h3>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  "h-4 w-4 shrink-0",
                  netProfit >= 0 ? "text-green-500" : "text-rose-500",
                )}
              >
                <title>Net income</title>
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div
              className={cn(
                "font-bold truncate overflow-hidden",
                netProfit >= 0 ? "text-emerald-600" : "text-rose-600",
                getCardValueFontSizeClass(
                  isLoading ? "" : formatCurrency(netProfit),
                ),
              )}
            >
              {isLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                formatCurrency(netProfit)
              )}
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                Transactions
              </h3>
              <List className="h-4 w-4 text-blue-500 shrink-0" />
            </div>
            <div
              className={cn(
                "font-bold text-blue-600 truncate overflow-hidden",
                getCardValueFontSizeClass(
                  isLoading ? "" : totalRecords.toLocaleString(),
                ),
              )}
            >
              {isLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                totalRecords.toLocaleString()
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Revenue vs Expenses</h3>
              <span className="text-sm text-muted-foreground">
                {periodLabel}
              </span>
            </div>

            <div className="flex justify-center items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded bg-emerald-600 inline-block"
                  style={{ backgroundColor: "#059669" }}
                />
                <span className="text-muted-foreground font-medium">
                  Revenue
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded bg-rose-600 inline-block"
                  style={{ backgroundColor: "#e11d48" }}
                />
                <span className="text-muted-foreground font-medium">
                  Expenses
                </span>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-075">
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : mergedChartData.length === 0 ? (
              <div className="flex items-center justify-center h-075">
                <span className="text-muted-foreground">No data available</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={mergedChartData}
                  margin={
                    isMobile
                      ? { top: 10, right: 5, left: -10, bottom: 0 }
                      : { top: 10, right: 10, left: 0, bottom: 0 }
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: isMobile ? 10 : 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(value) => {
                      const num = Number(value)
                      if (isMobile) {
                        return formatCompactNumber(num)
                      }
                      const currency = getAppCurrency()
                      return `${currency} ${Math.round(num).toLocaleString("en-US")}`
                    }}
                    tick={{ fontSize: isMobile ? 10 : 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={isMobile ? 40 : 80}
                  />
                  {!isMobile && (
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "8px",
                        color: "hsl(var(--popover-foreground))",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                      }}
                      itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                      labelStyle={{
                        color: "hsl(var(--popover-foreground))",
                        fontWeight: 600,
                      }}
                      formatter={(v, name) => [
                        formatCurrency(Number(v ?? 0)),
                        String(name ?? ""),
                      ]}
                      cursor={false}
                    />
                  )}
                  <Bar
                    dataKey="sales"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                    name="Revenue"
                  />
                  <Bar
                    dataKey="purchases"
                    fill="#e11d48"
                    radius={[4, 4, 0, 0]}
                    name="Expenses"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 rounded-xl border bg-card text-card-foreground shadow">
          <div className="p-6 flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Profit Margin</h3>
              <span className="text-sm text-muted-foreground">
                {periodLabel}
              </span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center flex-1 min-h-75">
                <span className="text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="relative w-full flex-1 min-h-75 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={profitMarginData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={95}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      stroke="transparent"
                    >
                      <Cell fill="#059669" />
                      <Cell fill="hsl(var(--muted))" className="opacity-40" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-bold tracking-tight text-foreground">
                    {profitMargin.toFixed(1)}%
                  </span>
                  <span className="text-xs text-muted-foreground font-medium mt-1">
                    Profit Margin
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2 *:min-w-0">
        <TopAmountList
          title="Top Revenue by Channel"
          rows={topRevenueByChannel}
          accent="revenue"
          emptyText="No revenue data available"
          timeframeLabel={periodLabel}
        />
        <TopAmountList
          title="Top Expenses by Category"
          rows={topExpensesByChannel}
          accent="expense"
          emptyText="No expense data available"
          timeframeLabel={periodLabel}
        />
      </div>

      <AIFinancialSummary period={period} periodLabel={periodLabel} />

      <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
        <div className="p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Recent Transactions</h3>
            <Button
              asChild
              variant="default"
              size="sm"
              className="hidden md:inline-flex"
            >
              <Link to="/transactions">
                View All Transactions
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-muted-foreground">No transactions yet</span>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="-mx-4 md:mx-0 md:hidden">
                <MobileTransactionList
                  transactions={recentTransactions}
                  containerClassName="rounded-none md:rounded-xl border-x-0 border-b-0 md:border-x md:border-b"
                />
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table className="w-full min-w-150">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-28">Type</TableHead>
                      <TableHead className="min-w-44">Source</TableHead>
                      <TableHead className="min-w-36">
                        Category / Channel
                      </TableHead>
                      <TableHead className="w-32 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTransactions.map((tx) => {
                      const isRevenue = tx.direction === "revenue"
                      const Icon = isRevenue ? ArrowUpRight : ArrowDownLeft
                      return (
                        <TableRow key={tx.id}>
                          <TableCell>{formatDateDMY(tx.date)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "gap-1 capitalize",
                                isRevenue ? "text-green-700" : "text-rose-700",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {tx.direction}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className="block truncate" title={tx.title}>
                              {tx.title}
                            </span>
                          </TableCell>
                          <TableCell>{tx.detail || "-"}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              tx.amount >= 0
                                ? "text-emerald-600"
                                : "text-rose-600",
                            )}
                          >
                            {formatCurrency(tx.amount)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Mobile Bottom Button */}
          <div className="md:hidden">
            <Button asChild variant="default" size="sm" className="w-full">
              <Link to="/transactions">
                View All Transactions
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
