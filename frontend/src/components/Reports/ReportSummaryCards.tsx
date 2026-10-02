import { formatCurrency } from "@/lib/currency"
import { cn } from "@/lib/utils"

export type SummaryCardItem = {
  label: string
  value: number
  icon: React.ComponentType<any>
  /** Tailwind text colour class for the value, e.g. text-green-600. */
  valueClassName?: string
  iconClassName?: string
}

interface ReportSummaryCardsProps {
  items: SummaryCardItem[]
}

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

/** Row of summary cards shown at the top of each report tab. */
export function ReportSummaryCards({ items }: ReportSummaryCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const formatted = formatCurrency(item.value)
        return (
          <div
            key={item.label}
            className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden"
          >
            <div className="p-3.5 sm:p-6 flex flex-col space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground truncate">
                  {item.label}
                </h3>
                <item.icon
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0",
                    item.iconClassName,
                  )}
                />
              </div>
              <div
                className={cn(
                  "font-bold truncate overflow-hidden",
                  getCardValueFontSizeClass(formatted),
                  item.valueClassName,
                )}
              >
                {formatted}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ReportSummaryCards
