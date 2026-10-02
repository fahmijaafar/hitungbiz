import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Loader, Package, Search } from "lucide-react-motion"
import { useEffect, useMemo, useRef, useState } from "react"
import { ProductsService } from "@/client"
import AddProduct from "@/components/Products/AddProduct"
import ProductCard from "@/components/Products/ProductCard"
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

export const Route = createFileRoute("/_layout/products")({
  component: Products,
  head: () => ({
    meta: [
      {
        title: `Products - ${APP_NAME}`,
      },
    ],
  }),
})

function ProductCardSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs animate-pulse">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted shrink-0" />
            <div>
              <div className="h-5 w-32 rounded bg-muted mb-2" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-8 w-8 rounded bg-muted" />
            <div className="h-8 w-8 rounded bg-muted" />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-4 w-36 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

function ProductsContent() {
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
    queryKey: ["products", "infinite", companyId],
    queryFn: async ({ pageParam = 0 }) => {
      return ProductsService.readProducts({
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

  // IntersectionObserver for progressive lazy loading as user scrolls
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

  const allProducts = useMemo(() => {
    return data?.pages?.flatMap((page) => page?.data ?? []) ?? []
  }, [data])

  const filteredProducts = useMemo(() => {
    let result = [...allProducts]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.product_name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      )
    }

    result.sort((a, b) => {
      if (sortBy === "name-asc") {
        return (a.product_name || "").localeCompare(b.product_name || "")
      }
      if (sortBy === "name-desc") {
        return (b.product_name || "").localeCompare(a.product_name || "")
      }
      if (sortBy === "price-asc") {
        return (a.sell_price ?? 0) - (b.sell_price ?? 0)
      }
      if (sortBy === "price-desc") {
        return (b.sell_price ?? 0) - (a.sell_price ?? 0)
      }
      if (sortBy === "stock-asc") {
        return (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0)
      }
      if (sortBy === "stock-desc") {
        return (b.stock_quantity ?? 0) - (a.stock_quantity ?? 0)
      }
      return 0
    })

    return result
  }, [allProducts, searchQuery, sortBy])

  return (
    <div className="flex flex-col gap-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
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
              <SelectItem value="price-asc">
                Sort by: Price (Low to High)
              </SelectItem>
              <SelectItem value="price-desc">
                Sort by: Price (High to Low)
              </SelectItem>
              <SelectItem value="stock-asc">
                Sort by: Stock (Low to High)
              </SelectItem>
              <SelectItem value="stock-desc">
                Sort by: Stock (High to Low)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards Grid / States */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"].map((key) => (
            <ProductCardSkeleton key={key} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <p className="text-rose-500 font-medium">
            Failed to load products. Please try again.
          </p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 bg-background rounded-2xl border border-dashed border-border">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-bold text-foreground">
            {searchQuery
              ? "No matching products found"
              : "You don't have any products yet"}
          </h3>
          <p className="text-muted-foreground text-sm mt-1">
            {searchQuery
              ? "Try searching for another keyword."
              : "Add a new product to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
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
                Loading more products...
              </div>
            ) : !hasNextPage ? (
              <p className="text-xs text-muted-foreground font-medium">
                All products loaded
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function Products() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          </div>
          <p className="text-muted-foreground">Manage your products</p>
        </div>
        <div>
          <AddProduct />
        </div>
      </div>
      <ProductsContent />
    </div>
  )
}

export default Products
