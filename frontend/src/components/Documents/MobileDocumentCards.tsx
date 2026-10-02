import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader, Search } from "lucide-react-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { DocumentsService } from "@/client"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import DocumentCard from "./DocumentCard"

function DocumentCardSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs animate-pulse">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-14 rounded-full bg-muted" />
            <div className="h-8 w-8 rounded bg-muted" />
          </div>
        </div>
        <div className="h-4 w-32 rounded bg-muted mt-2" />
        <div className="h-4 w-full rounded bg-muted mt-3" />
        <div className="h-4 w-2/3 rounded bg-muted mt-1.5" />
      </div>
      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-5 w-20 rounded bg-muted" />
      </div>
    </div>
  )
}

export function MobileDocumentCards() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const companyId =
    typeof window !== "undefined" ? localStorage.getItem("company_id") : null

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["documents", "infinite", companyId],
    queryFn: async ({ pageParam = 0 }) => {
      return DocumentsService.readDocuments({
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

  // IntersectionObserver for infinite scrolling as user scrolls
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

  const allDocuments = useMemo(() => {
    return data?.pages?.flatMap((page) => page?.data ?? []) ?? []
  }, [data])

  const filteredDocuments = useMemo(() => {
    let result = [...allDocuments]

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter(
        (doc) => doc.doctype.toLowerCase() === typeFilter.toLowerCase(),
      )
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter(
        (doc) => doc.status.toLowerCase() === statusFilter.toLowerCase(),
      )
    }

    // Search query filter
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim()
      result = result.filter((doc) => {
        const clientName =
          typeof doc.price_calculation === "object" && doc.price_calculation
            ? String(
                (doc.price_calculation as Record<string, unknown>)
                  .client_details &&
                  typeof (doc.price_calculation as Record<string, unknown>)
                    .client_details === "object"
                  ? ((
                      (doc.price_calculation as Record<string, unknown>)
                        .client_details as Record<string, unknown>
                    ).name ?? "")
                  : "",
              ).toLowerCase()
            : ""

        return (
          doc.docno.toLowerCase().includes(q) ||
          doc.title.toLowerCase().includes(q) ||
          doc.status.toLowerCase().includes(q) ||
          doc.doctype.toLowerCase().includes(q) ||
          clientName.includes(q)
        )
      })
    }

    return result
  }, [allDocuments, debouncedSearch, typeFilter, statusFilter])

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile Search & Filters Header */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="pl-9 bg-background border-border rounded-xl"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Type Filter Select */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full bg-background border-border rounded-xl font-medium text-foreground text-xs h-9">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="quotation">Quotation</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="paymentvoucher">Payment Voucher</SelectItem>
              <SelectItem value="deliveryorder">Delivery Order</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter Select */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full bg-background border-border rounded-xl font-medium text-foreground text-xs h-9">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Processing">Processing</SelectItem>
              <SelectItem value="Processed">Processed</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Partially Paid">Partially Paid</SelectItem>
              <SelectItem value="Canceled">Cancelled</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards List / Loading / Error / Empty States */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <DocumentCardSkeleton key={`skeleton-${i}`} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <p className="text-rose-500 font-medium text-sm">
            Failed to load documents. Please try again.
          </p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12 bg-background rounded-2xl border border-dashed border-border px-4">
          <div className="rounded-full bg-muted p-4 mb-3">
            <Search className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {debouncedSearch || typeFilter !== "all" || statusFilter !== "all"
              ? "No matching documents found"
              : "You don't have any documents yet"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {debouncedSearch || typeFilter !== "all" || statusFilter !== "all"
              ? "Try changing your search or filters."
              : "Add a new document to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3.5">
            {filteredDocuments.map((document) => (
              <DocumentCard key={document.id} document={document} />
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
                Loading more documents...
              </div>
            ) : !hasNextPage ? (
              <p className="text-xs text-muted-foreground font-medium">
                All documents loaded
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

export default MobileDocumentCards
