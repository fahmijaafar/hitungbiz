import { Loader, Search } from "lucide-react-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Transaction } from "@/components/Transactions/TransactionColumn"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/currency"
import { cn, formatDateDMY } from "@/lib/utils"

export interface MobileTransactionListProps {
  transactions: Transaction[]
  isLoading?: boolean
  showSearchAndFilter?: boolean
  onTransactionClick?: (transaction: Transaction) => void
  emptyMessage?: string
  onLoadMore?: () => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  containerClassName?: string
  allLoadedMessage?: string
}

function formatDateHeader(dateStr: string): string {
  if (!dateStr) return "Unknown Date"
  return formatDateDMY(dateStr)
}

function getGroupKey(dateStr: string): string {
  if (!dateStr) return "0000-00-00"
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toISOString().split("T")[0]
}

export function MobileTransactionList({
  transactions,
  isLoading = false,
  showSearchAndFilter = false,
  onTransactionClick,
  emptyMessage = "No transactions found",
  onLoadMore,
  hasNextPage,
  isFetchingNextPage,
  containerClassName,
  allLoadedMessage,
}: MobileTransactionListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<"all" | "revenue" | "expense">(
    "all",
  )
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // IntersectionObserver for lazy loading as user scrolls
  useEffect(() => {
    const element = loadMoreRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          onLoadMore
        ) {
          onLoadMore()
        }
      },
      { threshold: 0.1, rootMargin: "150px" },
    )

    observer.observe(element)
    return () => {
      if (element) observer.unobserve(element)
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore])

  // Filter transactions if search/filter controls are active
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterType !== "all" && tx.direction !== filterType) {
        return false
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const supplierOrChannel = (
          tx.direction === "expense"
            ? tx.supplierName || tx.title
            : tx.channel || tx.detail || tx.title
        ).toLowerCase()
        const notesOrCategory = (
          tx.direction === "revenue"
            ? tx.notes || "sale"
            : tx.notes || tx.category || tx.detail || "expense"
        ).toLowerCase()

        const amountStr = Math.abs(tx.amount).toString()

        return (
          supplierOrChannel.includes(query) ||
          notesOrCategory.includes(query) ||
          amountStr.includes(query)
        )
      }
      return true
    })
  }, [transactions, searchQuery, filterType])

  // Group filtered transactions by date
  const groupedTransactions = useMemo(() => {
    const groups: {
      key: string
      formattedDate: string
      items: Transaction[]
    }[] = []

    const map = new Map<
      string,
      { key: string; formattedDate: string; items: Transaction[] }
    >()

    for (const tx of filteredTransactions) {
      const key = getGroupKey(tx.date)
      const formattedDate = formatDateHeader(tx.date)

      if (!map.has(key)) {
        const groupObj = { key, formattedDate, items: [] }
        map.set(key, groupObj)
        groups.push(groupObj)
      }
      map.get(key)!.items.push(tx)
    }

    // Sort groups descending by date key
    groups.sort((a, b) => b.key.localeCompare(a.key))

    return groups
  }, [filteredTransactions])

  if (isLoading) {
    return (
      <div className="w-full space-y-3 p-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-full rounded-xl border border-border bg-card p-3 shadow-xs animate-pulse"
          >
            <div className="h-4 w-28 bg-muted rounded mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/2 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      {showSearchAndFilter && (
        <div className="flex flex-col gap-2 sm:flex-row items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select
            value={filterType}
            onValueChange={(v) =>
              setFilterType(v as "all" | "revenue" | "expense")
            }
          >
            <SelectTrigger className="h-9 w-full sm:w-[130px] text-sm">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent side="bottom">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {groupedTransactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-card rounded-xl border border-border p-6">
          <Search className="h-7 w-7 text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-muted-foreground">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "w-full rounded-xl border border-border bg-card shadow-xs overflow-hidden divide-y divide-border/40",
            containerClassName,
          )}
        >
          {groupedTransactions.map((group) => (
            <div key={group.key} className="w-full">
              {/* Date Header */}
              <div className="w-full py-1.5 px-3 bg-muted/70 dark:bg-muted/50 text-xs font-medium text-foreground text-center border-b border-border/40 select-none">
                {group.formattedDate}
              </div>

              {/* Transaction Rows within Date Group */}
              <div className="w-full divide-y divide-border/30">
                {group.items.map((tx, idx) => {
                  const isRevenue = tx.direction === "revenue"

                  // Line 1: Supplier name (for expense) or Revenue Channel (for sale)
                  const line1Text = isRevenue
                    ? tx.channel || tx.detail || tx.title || "Sale"
                    : tx.supplierName || tx.title || "Expense"

                  // Line 2: Left notes (fallback to 'Sale' or category), Right amount
                  const line2Notes = isRevenue
                    ? tx.notes || "Sale"
                    : tx.notes || tx.category || tx.detail || "Expense"

                  const isSubtleAlternate = idx % 2 === 1

                  return (
                    <div
                      key={tx.id}
                      onClick={() => onTransactionClick?.(tx)}
                      className={cn(
                        "w-full px-3 py-2.5 flex flex-col justify-center transition-colors text-left",
                        onTransactionClick &&
                          "cursor-pointer active:bg-muted/50",
                        isSubtleAlternate
                          ? "bg-muted/30 dark:bg-muted/20"
                          : "bg-card dark:bg-card",
                      )}
                    >
                      {/* First line: Supplier or Channel */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-foreground truncate max-w-[70%]">
                          {line1Text}
                        </span>
                      </div>

                      {/* Second line: Notes (left) + Amount (right) */}
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span
                          className="text-xs text-muted-foreground truncate max-w-[60%] sm:max-w-[70%]"
                          title={line2Notes}
                        >
                          {line2Notes}
                        </span>
                        <span
                          className={cn(
                            "text-right font-semibold text-sm shrink-0 whitespace-nowrap",
                            isRevenue
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lazy Loading Sentinel */}
      {(onLoadMore || hasNextPage !== undefined) && (
        <div
          ref={loadMoreRef}
          className="py-4 flex justify-center items-center"
        >
          {isFetchingNextPage ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
              <Loader className="h-4 w-4 animate-spin text-primary" />
              Loading more transactions...
            </div>
          ) : !hasNextPage ? (
            <p className="text-xs text-muted-foreground font-medium">
              {allLoadedMessage || "All transaction records loaded"}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default MobileTransactionList
