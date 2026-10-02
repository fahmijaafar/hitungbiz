import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Loader, Search, Users } from "lucide-react-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { ClientsService } from "@/client"
import AddClient from "@/components/Clients/AddClient"
import ClientCard from "@/components/Clients/ClientCard"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/_layout/clients")({
  component: Clients,
  head: () => ({
    meta: [
      {
        title: `Clients - ${APP_NAME}`,
      },
    ],
  }),
})

function ClientCardSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs animate-pulse">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="h-14 w-14 rounded-xl bg-muted shrink-0" />
            <div>
              <div className="h-5 w-32 rounded bg-muted mb-2" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-8 w-8 rounded bg-muted" />
            <div className="h-8 w-8 rounded bg-muted" />
            <div className="h-8 w-8 rounded bg-muted" />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="h-4 w-36 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

function ClientsContent() {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState("name-asc")
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const companyId = useCurrentCompanyId()

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["clients", "infinite", companyId],
    queryFn: async ({ pageParam = 0 }) => {
      return ClientsService.readClients({
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

  const allClients = useMemo(() => {
    return data?.pages?.flatMap((page) => page?.data ?? []) ?? []
  }, [data])

  const filteredClients = useMemo(() => {
    let result = [...allClients]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone_number?.toLowerCase().includes(q) ||
          c.company_name?.toLowerCase().includes(q) ||
          c.billing_address?.toLowerCase().includes(q) ||
          c.customer_type?.toLowerCase().includes(q),
      )
    }

    result.sort((a, b) => {
      if (sortBy === "name-asc") {
        return (a.name || "").localeCompare(b.name || "")
      }
      if (sortBy === "name-desc") {
        return (b.name || "").localeCompare(a.name || "")
      }
      if (sortBy === "type-company") {
        const aIsCo = a.customer_type?.toLowerCase() === "company" ? 0 : 1
        const bIsCo = b.customer_type?.toLowerCase() === "company" ? 0 : 1
        return aIsCo - bIsCo || (a.name || "").localeCompare(b.name || "")
      }
      if (sortBy === "type-individual") {
        const aIsInd = a.customer_type?.toLowerCase() === "individual" ? 0 : 1
        const bIsInd = b.customer_type?.toLowerCase() === "individual" ? 0 : 1
        return aIsInd - bIsInd || (a.name || "").localeCompare(b.name || "")
      }
      return 0
    })

    return result
  }, [allClients, searchQuery, sortBy])

  return (
    <div className="flex flex-col gap-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clients..."
            className="pl-9 bg-background border-border rounded-xl"
          />
        </div>

        <div className="w-full sm:w-auto">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-55 bg-background border-border rounded-xl font-medium text-foreground">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Sort by: Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Sort by: Name (Z-A)</SelectItem>
              <SelectItem value="type-company">
                Sort by: Company First
              </SelectItem>
              <SelectItem value="type-individual">
                Sort by: Individual First
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards Grid / States */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"].map((key) => (
            <ClientCardSkeleton key={key} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <p className="text-rose-500 font-medium">
            Failed to load clients. Please try again.
          </p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 bg-background rounded-2xl border border-dashed border-border">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold text-foreground">
            {searchQuery
              ? "No matching clients found"
              : "You don't have any clients yet"}
          </h3>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery
              ? "Try searching for another keyword."
              : "Add a new client to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>

          {/* Lazy Loading Sentinel */}
          <div
            ref={loadMoreRef}
            className="py-6 flex justify-center items-center"
          >
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                <Loader className="h-4 w-4 animate-spin text-primary" />
                Loading more clients...
              </div>
            ) : !hasNextPage ? (
              <p className="text-xs text-muted-foreground font-medium">
                All clients loaded
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function Clients() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          </div>
          <p className="text-muted-foreground">Manage your clients</p>
        </div>
        <div>
          <AddClient />
        </div>
      </div>
      <ClientsContent />
    </div>
  )
}

export default Clients
