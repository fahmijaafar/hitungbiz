import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Maps raw plan values to their human-readable display labels. */
const PLAN_LABELS: Record<string, string> = {
  personal: "Personal",
  pro: "Pro",
  max: "Max",
}

/** Colour styles per plan, designed to sit comfortably on the sidebar background. */
const PLAN_STYLES: Record<string, string> = {
  personal:
    "border-zinc-400/50 text-zinc-400 dark:border-zinc-500/60 dark:text-zinc-400",
  pro: "border-violet-400/70 text-violet-400 dark:border-violet-400/80 dark:text-violet-400",
  max: "border-amber-400/70 text-amber-400 dark:border-amber-400/80 dark:text-amber-400",
}

interface SubscriptionBadgeProps {
  plan: string
  isLoading?: boolean
  className?: string
}

/**
 * SubscriptionBadge — a compact pill that displays the user's current plan.
 *
 * Usage:
 *   <SubscriptionBadge plan="personal" />         // → [ Personal ]
 *   <SubscriptionBadge plan="pro" />              // → [ Pro ]
 *   <SubscriptionBadge plan="max" />              // → [ Max ]
 *   <SubscriptionBadge plan="personal" isLoading />  // → skeleton pill
 */
export function SubscriptionBadge({
  plan,
  isLoading = false,
  className,
}: SubscriptionBadgeProps) {
  if (isLoading) {
    // Skeleton preserves approximately the same dimensions as the badge itself
    return <Skeleton className={cn("h-4 w-16 rounded-full", className)} />
  }

  const label = PLAN_LABELS[plan] ?? plan
  const colourClass = PLAN_STYLES[plan] ?? PLAN_STYLES.personal

  return (
    <span
      data-testid="subscription-badge"
      data-plan={plan}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-[10px] font-medium leading-none",
        "whitespace-nowrap shrink-0",
        colourClass,
        className,
      )}
    >
      {label}
    </span>
  )
}
