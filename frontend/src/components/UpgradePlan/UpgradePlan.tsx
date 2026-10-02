import { Check, X } from "lucide-react-motion"
import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import useSubscription from "@/hooks/useSubscription"
import {
  type FeatureValue,
  formatLimitValue,
  PLAN_FEATURE_LIMITS,
} from "@/lib/planLimits"
import { cn } from "@/lib/utils"

// ─── Billing period ───────────────────────────────────────────────────────────
type BillingPeriod = "monthly" | "yearly"

const YEARLY_DISCOUNT = 0.05 // 5 %

interface Plan {
  id: string
  name: string
  description: string
  /** RM per month (null = "Free" or not priced yet) */
  monthlyPrice: number | null
  /** Label shown when there is no numeric price (e.g. "Free") */
  freePriceLabel?: string
  features: Record<string, FeatureValue>
}

const PLANS: Plan[] = [
  {
    id: "personal",
    name: "Personal",
    description: "For individuals and small businesses getting started.",
    monthlyPrice: null,
    freePriceLabel: "Free",
    features: PLAN_FEATURE_LIMITS.personal,
  },
  {
    id: "pro",
    name: "Pro",
    description:
      "For growing businesses that need more capacity and automation.",
    monthlyPrice: 29,
    features: PLAN_FEATURE_LIMITS.pro,
  },
  {
    id: "max",
    name: "Max",
    description: "For serious businesses with larger teams and higher usage.",
    monthlyPrice: 59,
    features: PLAN_FEATURE_LIMITS.max,
  },
]

// ─── Feature row labels (order matters — must be consistent across all cards) ─
const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "companies", label: "Companies" },
  { key: "staff", label: "Staff" },
  { key: "products", label: "Products" },
  { key: "customers", label: "Customers" },
  { key: "documents", label: "Documents / month" },
  { key: "ocr", label: "OCR" },
  { key: "aiSummary", label: "AI Summary" },
  { key: "recurring_invoices", label: "Recurring Invoices" },
  { key: "integrations", label: "Integrations" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the feature is meaningfully available (not 0 / "None"). */
function isFeatureAvailable(value: FeatureValue): boolean {
  return value !== 0
}

/**
 * Derive the effective per-month price to display based on billing period.
 * For yearly billing, monthly equivalent = monthly × 12 × (1 - discount) / 12
 *                                        = monthly × (1 - discount)
 */
function effectiveMonthlyPrice(
  monthlyPrice: number,
  period: BillingPeriod,
): number {
  if (period === "yearly") {
    return Math.floor(monthlyPrice * (1 - YEARLY_DISCOUNT))
  }
  return monthlyPrice
}

// ─── Plan accent colours ──────────────────────────────────────────────────────
const PLAN_ACCENTS: Record<string, { border: string; badge: string }> = {
  personal: {
    border:
      "border-zinc-400 dark:border-zinc-500 ring-2 ring-zinc-400/30 dark:ring-zinc-500/30",
    badge:
      "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700",
  },
  pro: {
    border:
      "border-violet-500 dark:border-violet-400 ring-2 ring-violet-400/30 dark:ring-violet-400/30",
    badge:
      "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-500",
  },
  max: {
    border:
      "border-amber-500 dark:border-amber-400 ring-2 ring-amber-400/30 dark:ring-amber-400/30",
    badge:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-500",
  },
}

// ─── Billing Toggle ───────────────────────────────────────────────────────────

interface BillingToggleProps {
  period: BillingPeriod
  onChange: (p: BillingPeriod) => void
}

function BillingToggle({ period, onChange }: BillingToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-full border bg-muted p-1 text-sm gap-0.5">
        <button
          type="button"
          onClick={() => onChange("monthly")}
          className={cn(
            "rounded-full px-4 py-1 font-medium transition-all duration-200 focus:outline-none",
            period === "monthly"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onChange("yearly")}
          className={cn(
            "rounded-full px-4 py-1 font-medium transition-all duration-200 focus:outline-none flex items-center gap-2",
            period === "yearly"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Yearly
          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50 px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap">
            5% off
          </span>
        </button>
      </div>
    </div>
  )
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────

import { SubscriptionService } from "@/client"

interface PlanCardProps {
  plan: Plan
  isCurrent: boolean
  effectivePlan: string
  billingPeriod: BillingPeriod
}

function PlanCard({
  plan,
  isCurrent,
  effectivePlan,
  billingPeriod,
}: PlanCardProps) {
  const accent = PLAN_ACCENTS[plan.id] ?? PLAN_ACCENTS.personal
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubscribe = async () => {
    if (plan.id === "personal") return

    if (effectivePlan !== "personal" && plan.id !== effectivePlan) {
      toast.info("Plan upgrade transition coming soon", {
        description: `You are currently on the ${effectivePlan.toUpperCase()} plan. Upgrades between active paid plans will be supported shortly.`,
      })
      return
    }

    try {
      setIsSubmitting(true)
      const res = await SubscriptionService.createSubscriptionCheckout({
        requestBody: {
          plan: plan.id,
          billing_interval: billingPeriod,
        },
      })
      if (res.checkout_url) {
        toast.success("Redirecting to payment gateway...")
        window.location.href = res.checkout_url
      }
    } catch (err: any) {
      toast.error("Unable to start payment checkout", {
        description: err?.body?.detail || err?.message || "Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Price display ──────────────────────────────────────────────────────────
  let priceNode: React.ReactNode

  if (plan.monthlyPrice === null) {
    // Personal — always Free regardless of billing period
    priceNode = (
      <span className="text-2xl font-extrabold tracking-tight">
        {plan.freePriceLabel ?? "Free"}
      </span>
    )
  } else if (billingPeriod === "yearly") {
    // Yearly mode: annual total is the hero; monthly equivalent is secondary
    const yearlyTotal = Math.floor(
      plan.monthlyPrice * 12 * (1 - YEARLY_DISCOUNT),
    )
    const monthlyEquiv = effectiveMonthlyPrice(plan.monthlyPrice, "yearly")

    priceNode = (
      <div className="flex flex-col gap-0.5">
        {/* Hero: yearly total — big + highlighted */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tracking-tight">
            RM{yearlyTotal}
          </span>
          <span className="text-sm font-medium /70">/year</span>
        </div>
        {/* Secondary: monthly breakdown — small + muted */}
        <p className="text-xs text-muted-foreground">
          RM{monthlyEquiv}/month · save RM
          {Math.floor(plan.monthlyPrice * 12 - yearlyTotal)}/year
        </p>
      </div>
    )
  } else {
    // Monthly mode: standard display
    priceNode = (
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold tracking-tight">
          RM{plan.monthlyPrice}
        </span>
        <span className="text-base font-medium text-muted-foreground">
          /month
        </span>
      </div>
    )
  }

  return (
    <Card
      className={cn(
        "relative flex flex-col transition-shadow duration-200",
        isCurrent ? accent.border : "hover:shadow-md hover:border-border/80",
      )}
    >
      {/* Current plan badge */}
      {isCurrent && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold whitespace-nowrap",
              accent.badge,
            )}
          >
            Current Plan
          </span>
        </div>
      )}

      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {plan.description}
        </CardDescription>
        <div className="pt-2">{priceNode}</div>
      </CardHeader>

      <CardContent className="flex-1">
        <ul className="space-y-2.5">
          {FEATURE_ROWS.map(({ key, label }) => {
            const value = plan.features[key]
            const available = isFeatureAvailable(value)
            const display = formatLimitValue(value)

            return (
              <li key={key} className="flex items-center gap-2.5 text-sm">
                {available ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : (
                  <X className="size-4 shrink-0 text-muted-foreground/50" />
                )}
                <span
                  className={cn(
                    "flex-1",
                    !available && "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    !available
                      ? "text-muted-foreground/50"
                      : display === "Unlimited"
                        ? "text-primary"
                        : "text-foreground",
                  )}
                >
                  {display}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>

      <CardFooter className="pt-4">
        {isCurrent ? (
          <Button
            variant="secondary"
            className="w-full cursor-default"
            disabled
            aria-label={`You are currently on the ${plan.name} plan`}
          >
            Current Plan
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={handleSubscribe}
            disabled={isSubmitting}
            aria-label={`Subscribe to ${plan.name}`}
          >
            {isSubmitting ? "Connecting..." : "Subscribe"}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function PlanCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <Skeleton className="h-6 w-24 mb-1" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 mt-1" />
        <Skeleton className="h-8 w-20 mt-3" />
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton list has no stable keys
            <li key={i} className="flex items-center gap-2.5">
              <Skeleton className="size-4 rounded-full shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="pt-4">
        <Skeleton className="h-9 w-full rounded-md" />
      </CardFooter>
    </Card>
  )
}

// ─── Main UpgradePlan page ────────────────────────────────────────────────────

export function UpgradePlan() {
  const { subscription, isLoading } = useSubscription()
  const [billingPeriod, setBillingPeriod] =
    React.useState<BillingPeriod>("monthly")

  const effectivePlan =
    subscription.effective_plan ?? subscription.plan ?? "personal"

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Choose the plan that fits your business
          </h1>
          <p className="mt-1.5 text-muted-foreground max-w-xl">
            Pick a plan based on your team size and usage. You can upgrade at
            any time as your business grows.
          </p>
        </div>
        <div className="shrink-0">
          <BillingToggle period={billingPeriod} onChange={setBillingPeriod} />
        </div>
      </div>

      {/* Pricing cards grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? PLANS.map((plan) => <PlanCardSkeleton key={plan.id} />)
          : PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={effectivePlan === plan.id}
                effectivePlan={effectivePlan}
                billingPeriod={billingPeriod}
              />
            ))}
      </div>
    </div>
  )
}

export default UpgradePlan
