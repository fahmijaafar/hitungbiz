import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Briefcase, Loader as Loader2 } from "lucide-react-motion"
import { Suspense, useEffect, useMemo, useRef } from "react"
import { CompaniesService, UsersService } from "@/client"
import AddCompany from "@/components/Companies/AddCompany"
import CompanyCard from "@/components/Companies/CompanyCard"
import PendingTable from "@/components/Pending/PendingTable"
import { APP_NAME } from "@/lib/app"

const PAGE_SIZE = 12

function CompaniesGrid() {
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const { data: currentUser } = useSuspenseQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
  })

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["companies", "infinite"],
    queryFn: ({ pageParam = 0 }) =>
      CompaniesService.readCompanies({
        skip: pageParam as number,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || !Array.isArray(lastPage?.data)) return undefined
      const pages = Array.isArray(allPages) ? allPages : []
      const loadedCount = pages.reduce((acc, p) => {
        const pageData = Array.isArray(p?.data) ? p.data : []
        return acc + pageData.length
      }, 0)
      const totalCount =
        typeof lastPage?.count === "number" ? lastPage.count : 0
      if (loadedCount < totalCount) {
        return loadedCount
      }
      return undefined
    },
    staleTime: 60_000,
  })

  // IntersectionObserver for lazy loading company cards as user scrolls
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

  const companies = useMemo(() => {
    const rawList = data?.pages?.flatMap((page) => page?.data ?? []) ?? []
    const seen = new Set<string>()
    return rawList.filter((company) => {
      if (!company?.id || seen.has(company.id)) return false
      seen.add(company.id)
      return true
    })
  }, [data])

  const myCompanyId = currentUser?.company_id

  if (isLoading) {
    return <PendingTable />
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <h3 className="text-lg font-semibold text-destructive">
          Failed to load companies
        </h3>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    )
  }

  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <h3 className="text-lg font-semibold">No companies yet</h3>
        <p className="text-muted-foreground">
          Create a company to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {companies.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            selected={String(myCompanyId) === String(company.id)}
          />
        ))}
      </div>

      {/* Sentinel element for infinite scroll lazy loading */}
      <div ref={loadMoreRef} className="py-2 flex justify-center items-center">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading more companies...
          </div>
        )}
      </div>
    </div>
  )
}

export default function Companies() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
          </div>
          <p className="text-muted-foreground">Manage your companies</p>
        </div>
        <div className="flex items-center gap-2">
          <AddCompany />
        </div>
      </div>

      <div className="mt-6">
        <Suspense fallback={<PendingTable />}>
          <CompaniesGrid />
        </Suspense>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_layout/companies")({
  component: Companies,
  head: () => ({
    meta: [
      {
        title: `Companies - ${APP_NAME}`,
      },
    ],
  }),
})
