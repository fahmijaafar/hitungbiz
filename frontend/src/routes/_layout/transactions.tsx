import { useInfiniteQuery, useSuspenseQueries } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  List,
  ListChecks,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react-motion"
import { Suspense, useMemo } from "react"
import { PurchasesService, SalesService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import PendingTable from "@/components/Pending/PendingTable"
import { MobileTransactionList } from "@/components/Transactions/MobileTransactionList"
import {
  columns,
  type Transaction,
} from "@/components/Transactions/TransactionColumn"
import { Button } from "@/components/ui/button"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"
import { formatCurrency } from "@/lib/currency"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_layout/transactions")({
  component: Transactions,
  head: () => ({
    meta: [
      {
        title: `Transactions - ${APP_NAME}`,
      },
    ],
  }),
})

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

function MobileTransactionsCards() {
  const companyId = useCurrentCompanyId()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["transactions", "infinite", companyId],
      queryFn: async ({ pageParam = 0 }) => {
        const [salesRes, purchasesRes] = await Promise.all([
          SalesService.readSales({
            skip: pageParam as number,
            limit: 12,
            companyId,
          }),
          PurchasesService.readPurchases({
            skip: pageParam as number,
            limit: 12,
            companyId,
          }),
        ])
        return {
          sales: salesRes,
          purchases: purchasesRes,
          pageParam: pageParam as number,
        }
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage) return undefined

        let loadedSales = 0
        let loadedPurchases = 0
        for (const p of allPages) {
          loadedSales += p?.sales?.data?.length || 0
          loadedPurchases += p?.purchases?.data?.length || 0
        }

        const totalSalesCount = lastPage.sales?.count ?? 0
        const totalPurchasesCount = lastPage.purchases?.count ?? 0

        if (
          loadedSales < totalSalesCount ||
          loadedPurchases < totalPurchasesCount
        ) {
          return (lastPage.pageParam as number) + 12
        }

        return undefined
      },
    })

  const transactions = useMemo<Transaction[]>(() => {
    if (!data?.pages) return []

    const salesList: Transaction[] = []
    const purchasesList: Transaction[] = []

    for (const page of data.pages) {
      if (page.sales?.data) {
        for (const sale of page.sales.data) {
          salesList.push({
            id: `sale-${sale.id}`,
            sourceType: "sale",
            sourceId: sale.id,
            date: sale.date ?? "",
            title: sale.notes || "Sale",
            detail: sale.channel,
            amount: Number(sale.final_amount ?? 0),
            direction: "revenue",
            status: sale.status,
            notes: sale.notes,
            channel: sale.channel,
          })
        }
      }

      if (page.purchases?.data) {
        for (const purchase of page.purchases.data) {
          purchasesList.push({
            id: `purchase-${purchase.id}`,
            sourceType: "purchase",
            sourceId: purchase.id,
            date: purchase.date,
            title: purchase.supplier_name,
            detail: purchase.category,
            amount: -Number(purchase.final_amount ?? 0),
            direction: "expense",
            status: purchase.status,
            notes: purchase.notes,
            supplierName: purchase.supplier_name,
            category: purchase.category,
          })
        }
      }
    }

    const uniqueMap = new Map<string, Transaction>()
    for (const t of [...salesList, ...purchasesList]) {
      uniqueMap.set(t.id, t)
    }

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })
  }, [data])

  return (
    <MobileTransactionList
      transactions={transactions}
      isLoading={isLoading}
      showSearchAndFilter
      onLoadMore={fetchNextPage}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      allLoadedMessage="All transactions loaded"
    />
  )
}

function TransactionsTableContent() {
  const companyId = useCurrentCompanyId()
  const [salesQuery, purchasesQuery] = useSuspenseQueries({
    queries: [
      {
        queryFn: () =>
          SalesService.readSales({ skip: 0, limit: 100, companyId }),
        queryKey: ["sales", companyId],
      },
      {
        queryFn: () =>
          PurchasesService.readPurchases({ skip: 0, limit: 100, companyId }),
        queryKey: ["purchases", companyId],
      },
    ],
  })

  const transactions = useMemo<Transaction[]>(() => {
    const sales = salesQuery.data.data.map((sale) => ({
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

    const purchases = purchasesQuery.data.data.map((purchase) => ({
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

    return [...sales, ...purchases].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })
  }, [salesQuery.data.data, purchasesQuery.data.data])

  const totalIn = transactions
    .filter((t) => t.direction === "revenue")
    .reduce((sum, t) => sum + t.amount, 0)
  const totalOut = transactions
    .filter((t) => t.direction === "expense")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const netCashFlow = totalIn - totalOut
  const totalRecords = transactions.length

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                Total In
              </h3>
              <ArrowDown className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
            <div
              className={cn(
                "font-bold text-emerald-600 truncate overflow-hidden",
                getCardValueFontSizeClass(formatCurrency(totalIn)),
              )}
            >
              {formatCurrency(totalIn)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                Total Out
              </h3>
              <ArrowUp className="h-4 w-4 text-rose-500 shrink-0" />
            </div>
            <div
              className={cn(
                "font-bold text-rose-600 truncate overflow-hidden",
                getCardValueFontSizeClass(formatCurrency(totalOut)),
              )}
            >
              {formatCurrency(totalOut)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                {netCashFlow >= 0 ? "Net Income" : "Net Loss"}
              </h3>
              <ArrowUpDown className="h-4 w-4 text-blue-500 shrink-0" />
            </div>
            <div
              className={cn(
                "font-bold truncate overflow-hidden",
                netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600",
                getCardValueFontSizeClass(formatCurrency(netCashFlow)),
              )}
            >
              {formatCurrency(netCashFlow)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden">
          <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground truncate">
                Total Records
              </h3>
              <List className="h-4 w-4 text-blue-500 shrink-0" />
            </div>
            <div
              className={cn(
                "font-bold text-blue-600 truncate overflow-hidden",
                getCardValueFontSizeClass(totalRecords.toLocaleString()),
              )}
            >
              {totalRecords.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">
            You don't have any transactions yet
          </h3>
          <p className="text-muted-foreground">
            Add a revenue or expense to start tracking activity
          </p>
        </div>
      ) : (
        <DataTable columns={columns} data={transactions} />
      )}
    </div>
  )
}

function TransactionsTable() {
  return (
    <Suspense
      fallback={<PendingTable columns={columns as ColumnDef<unknown>[]} />}
    >
      <TransactionsTableContent />
    </Suspense>
  )
}

function Transactions() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-2xl tracking-tight">Transactions</h1>
          </div>
          <p className="text-muted-foreground">
            Review revenue and expenses together
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            asChild
            className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white border-none"
          >
            <Link to="/sales">
              <TrendingUp className="mr-2 h-4 w-4 text-white" />
              Add Revenue
            </Link>
          </Button>
          <Button
            asChild
            className="flex-1 sm:flex-initial bg-rose-600 hover:bg-rose-700 text-white border-none"
          >
            <Link to="/purchases">
              <TrendingDown className="mr-2 h-4 w-4 text-white" />
              Add Expense
            </Link>
          </Button>
        </div>
      </div>

      {/* Mobile Card View (Lazy Loaded) */}
      <div className="md:hidden">
        <MobileTransactionsCards />
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block">
        <TransactionsTable />
      </div>
    </div>
  )
}

export default Transactions
