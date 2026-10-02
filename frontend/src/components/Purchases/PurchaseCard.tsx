import { useState } from "react"
import type { PurchasePublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import { cn, formatDateDMY } from "@/lib/utils"
import EditPurchase from "./EditPurchase"
import { PurchaseActionsMenu } from "./PurchaseActionsMenu"

interface PurchaseCardProps {
  purchase: PurchasePublic
}

function getStatusClass(status?: string) {
  if (!status) return ""
  const s = status.toLowerCase()
  if (s === "completed" || s === "paid")
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
  if (s === "pending" || s === "unpaid")
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
  if (s === "canceled" || s === "cancelled")
    return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
  return "bg-muted text-muted-foreground border-border"
}

export function PurchaseCard({ purchase }: PurchaseCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)

  const formattedDate = formatDateDMY(purchase.date)

  const notesText = purchase.notes?.trim()
    ? purchase.notes
    : purchase.category || "Expense"

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
        {/* Top Header: Supplier + Actions */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base text-foreground leading-snug break-words group-hover:text-primary transition-colors">
                {purchase.supplier_name}
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
              <PurchaseActionsMenu purchase={purchase} />
            </div>
          </div>

          {/* Subtle Divider */}
          <div className="my-2.5 border-t border-border/60" />

          {/* Prominently Centered Amount */}
          <div className="py-0.5 text-center">
            <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 tracking-tight">
              {formatCurrency(purchase.final_amount)}
            </span>
          </div>
        </div>

        {/* Bottom Row: Date + Status (if present) */}
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            {formattedDate}
          </span>
          {purchase.status && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize transition-colors",
                getStatusClass(purchase.status),
              )}
            >
              {purchase.status}
            </span>
          )}
        </div>
      </div>

      <EditPurchase
        purchase={purchase}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => setIsEditOpen(false)}
      />
    </>
  )
}

export default PurchaseCard
