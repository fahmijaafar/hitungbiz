import { Package, Tag } from "lucide-react-motion"
import { useState } from "react"
import type { ProductPublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import EditProduct from "./EditProduct"
import { ProductActionsMenu } from "./ProductActionsMenu"

interface ProductCardProps {
  product: ProductPublic
}

export function ProductCard({ product }: ProductCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const stockQty = product.stock_quantity ?? 0
  const unit = product.unit_type || "pcs"
  const category = product.category || "—"

  return (
    <>
      <div
        onClick={() => setIsEditOpen(true)}
        className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:shadow-md hover:border-primary/40 cursor-pointer"
      >
        <div>
          {/* Top Header Section: Title & Actions Menu */}
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-base leading-snug text-foreground break-words min-w-0 flex-1 group-hover:text-primary transition-colors">
              {product.product_name}
            </h3>
            <div
              className="shrink-0 -mr-1 -mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ProductActionsMenu product={product} />
            </div>
          </div>

          {/* Category */}
          <p className="mt-1 text-sm text-muted-foreground font-normal">
            {category}
          </p>

          {/* Horizontal Divider */}
          <div className="my-3.5 border-t border-border/60" />

          {/* Price and Stock Row */}
          <div className="flex items-center justify-between text-sm font-medium">
            {/* Price Section */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Tag className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="truncate text-foreground font-semibold">
                {formatCurrency(product.sell_price)}
              </span>
            </div>

            {/* Vertical Divider */}
            <div className="h-4 w-[1px] bg-border/80 mx-3 shrink-0" />

            {/* Stock Section */}
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-start sm:justify-start">
              <Package className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="truncate text-foreground font-medium">
                {stockQty} {unit}
              </span>
            </div>
          </div>
        </div>
      </div>

      <EditProduct
        product={product}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => setIsEditOpen(false)}
      />
    </>
  )
}

export default ProductCard
