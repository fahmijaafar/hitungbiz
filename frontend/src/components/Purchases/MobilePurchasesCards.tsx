import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader, Search } from "lucide-react-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { PurchasesService } from "@/client"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import PurchaseCard from "./PurchaseCard"

function PurchaseCardSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 shadow-xs animate-pulse">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="h-5 w-3/4 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted mt-1.5" />
          </div>
          <div className="h-8 w-8 rounded bg-muted shrink-0" />
        </div>
        <div className="my-2.5 border-t border-border/60" />
        <div className="py-0.5 flex justify-center">
          <div className="h-7 w-36 rounded bg-muted" />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <div className="h-4 w-20 rounded bg-muted" />
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
    </div>
  )
}

export function MobilePurchasesCards() {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("date-desc")
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const companyId =
    typeof window !== "undefined" ? localStorage.getItem("company_id") : null

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["purchases", "infinite", companyId],
    queryFn: async ({ pageParam = 0 }) => {
      return PurchasesService.readPurchases({
        skip: pageParam as number,
        limit: 12,
        companyId: companyId,
      })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || !lastPage.data) return undefined
      const loadedCount = allPages.reduce(
        (acc, p) => acc + (p?.data?.length || 0),
        0,
      )
      if (loadedCount < (lastPage.count ?? 0)) {
        return loadedCount
      }
      return undefined
    },
  })

  // IntersectionObserver for lazy loading as user scrolls
  useEffect(() => {
    const element = loadMoreRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1, rootMargin: "150px" },
    )

    observer.observe(element)
    return () => {
      if (element) observer.unobserve(element)
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allPurchases = useMemo(() => {
    return data?.pages?.flatMap((page) => page?.data ?? []) ?? []
  }, [data])

  const filteredPurchases = useMemo(() => {
    let result = [...allPurchases]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.supplier_name?.toLowerCase().includes(q) ||
          p.notes?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.invoice_no?.toLowerCase().includes(q),
      )
    }

    result.sort((a, b) => {
      if (sortBy === "date-desc") {
        return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      }
      if (sortBy === "date-asc") {
        return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
      }
      if (sortBy === "amount-desc") {
        return (b.final_amount ?? 0) - (a.final_amount ?? 0)
      }
      if (sortBy === "amount-asc") {
        return (a.final_amount ?? 0) - (b.final_amount ?? 0)
      }
      return 0
    })

    return result
  }, [allPurchases, searchQuery, sortBy])

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Sort controls for Mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search expenses..."
            className="pl-9 bg-background border-border rounded-xl"
          />
        </div>

        <div className="w-full sm:w-auto">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-[200px] bg-background border-border rounded-xl font-medium text-foreground">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Sort by: Date (Newest)</SelectItem>
              <SelectItem value="date-asc">Sort by: Date (Oldest)</SelectItem>
              <SelectItem value="amount-desc">
                Sort by: Amount (High to Low)
              </SelectItem>
              <SelectItem value="amount-asc">
                Sort by: Amount (Low to High)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards List / Loading / Error / Empty States */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <PurchaseCardSkeleton key={`skeleton-${i}`} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <p className="text-rose-500 font-medium text-sm">
            Failed to load expenses. Please try again.
          </p>
        </div>
      ) : filteredPurchases.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12 bg-background rounded-2xl border border-dashed border-border">
          <div className="rounded-full bg-muted p-4 mb-3">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {searchQuery
              ? "No matching expenses found"
              : "You don't have any expenses yet"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {searchQuery
              ? "Try searching with a different keyword."
              : "Add a new expense entry to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            {filteredPurchases.map((purchase) => (
              <PurchaseCard key={purchase.id} purchase={purchase} />
            ))}
          </div>

          {/* Lazy Loading Sentinel */}
          <div
            ref={loadMoreRef}
            className="py-4 flex justify-center items-center"
          >
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Loader className="h-4 w-4 animate-spin text-primary" />
                Loading more expenses...
              </div>
            ) : !hasNextPage ? (
              <p className="text-xs text-muted-foreground font-medium">
                All expense records loaded
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

export default MobilePurchasesCards
