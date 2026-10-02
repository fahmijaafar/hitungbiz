import { useState } from "react"
import type { SalePublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import { cn, formatDateDMY } from "@/lib/utils"
import EditSale from "./EditSale"
import { SaleActionsMenu } from "./SaleActionsMenu"

interface SaleCardProps {
  sale: SalePublic
}

function getStatusClass(status: string) {
  const s = status?.toLowerCase()
  if (s === "completed")
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
  if (s === "pending")
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
  if (s === "canceled" || s === "cancelled")
    return "bg-red-500/10 text-rose-600 dark:text-rose-400 border-red-500/20"
  return "bg-muted text-muted-foreground border-border"
}

export function SaleCard({ sale }: SaleCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)

  const formattedDate = formatDateDMY(sale.date)

  const notesText = sale.notes?.trim() ? sale.notes : "Sale"

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsEditOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsEditOpen(true)
          }
        }}
        className="group flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 shadow-xs text-card-foreground cursor-pointer transition-all hover:border-primary/40 hover:shadow-md"
      >
        {/* Top Header: Channel + Actions */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base text-foreground leading-snug break-words group-hover:text-primary transition-colors">
                {sale.channel}
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2 break-words">
                {notesText}
              </p>
            </div>
            <div
              className="shrink-0 -mr-1 -mt-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <SaleActionsMenu sale={sale} />
            </div>
          </div>

          {/* Subtle Divider */}
          <div className="my-2.5 border-t border-border/60" />

          {/* Prominently Centered Amount */}
          <div className="py-0.5 text-center">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatCurrency(sale.final_amount)}
            </span>
          </div>
        </div>

        {/* Bottom Row: Date + Status */}
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            {formattedDate}
          </span>
          {sale.status && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize transition-colors",
                getStatusClass(sale.status),
              )}
            >
              {sale.status}
            </span>
          )}
        </div>
      </div>

      <EditSale
        sale={sale}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => setIsEditOpen(false)}
      />
    </>
  )
}

export default SaleCard
