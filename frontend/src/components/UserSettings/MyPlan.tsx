import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  CreditCard,
  Crown,
  History,
  RefreshCw,
  ShieldAlert,
  Zap,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  SubscriptionService,
  type SubscriptionDetailsPublic,
} from "@/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LoadingButton } from "@/components/ui/loading-button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { isLoggedIn } from "@/hooks/useAuth"

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  try {
    return format(new Date(dateStr), "dd MMMM yyyy")
  } catch {
    return dateStr
  }
}

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-"
  try {
    return format(new Date(dateStr), "dd MMM yyyy")
  } catch {
    return dateStr
  }
}

function formatPrice(amountCents: number, currency = "MYR"): string {
  const rm = (amountCents / 100).toFixed(2)
  return `${currency === "MYR" ? "RM" : currency} ${rm}`
}

function getStatusBadge(status: string, cancelAtPeriodEnd: boolean) {
  const normalized = status.toLowerCase()
  if (cancelAtPeriodEnd) {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 gap-1.5 font-medium">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Cancellation scheduled
      </Badge>
    )
  }
  switch (normalized) {
    case "active":
      return (
        <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Active
        </Badge>
      )
    case "expired":
      return (
        <Badge variant="outline" className="border-rose-500 text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Expired
        </Badge>
      )
    case "cancelled":
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Cancelled
        </Badge>
      )
    case "past_due":
    case "past due":
      return (
        <Badge variant="outline" className="border-amber-600 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Past Due
        </Badge>
      )
    case "pending":
      return (
        <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Pending
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="gap-1.5 font-medium">
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          {status}
        </Badge>
      )
  }
}

export default function MyPlan() {
  const navigate = useNavigate()
  const [isRenewing, setIsRenewing] = useState(false)

  const {
    data: details,
    isLoading,
    isError,
    refetch,
  } = useQuery<SubscriptionDetailsPublic>({
    queryKey: ["subscription-details"],
    queryFn: SubscriptionService.readSubscriptionDetails,
    enabled: isLoggedIn(),
    staleTime: 60 * 1000,
  })

  const handleRenew = async () => {
    setIsRenewing(true)
    try {
      const interval = details?.billing_interval || "monthly"
      const response = await SubscriptionService.renewSubscriptionCheckout({
        requestBody: { billing_interval: interval },
      })
      if (response.checkout_url) {
        toast.success("Redirecting to CHIP Collect checkout...")
        window.location.href = response.checkout_url
      } else {
        toast.error("Unable to generate checkout URL.")
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to initiate renewal checkout."
      toast.error(errorMsg)
    } finally {
      setIsRenewing(false)
    }
  }

  const handleUpgrade = () => {
    navigate({ to: "/upgrade" })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-10 w-full max-w-sm mt-2" />
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`sk-${i}`} className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !details) {
    return (
      <Card className="p-6 text-center space-y-4">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Unable to Load Subscription Details</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          We encountered an issue retrieving your current plan information. Please try again or contact support if the issue persists.
        </p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </Card>
    )
  }

  const effectivePlan = details.effective_plan || "personal"
  const storedPlan = details.plan || "personal"
  const isPersonal = effectivePlan === "personal"
  const isPro = effectivePlan === "pro"
  const isMax = effectivePlan === "max"
  const isExpired = details.is_expired
  const billingInterval = details.billing_interval
    ? details.billing_interval.charAt(0).toUpperCase() + details.billing_interval.slice(1)
    : "Free"

  const usage = (details.usage || {}) as {
    companies?: number
    staff?: number
    products?: number
    customers?: number
    documents?: { used?: number; limit?: number | null }
    ocr?: { used?: number; limit?: number | null }
    ai_summary?: {
      available?: boolean
      cooldown_seconds?: number | null
      next_available_at?: string | null
    }
  }
  const limits = (details.limits || {}) as Record<string, number | string | null>

  const planTitles: Record<string, string> = {
    personal: "Personal",
    pro: "Pro",
    max: "Max",
  }

  const planDescriptions: Record<string, string> = {
    personal: "Free plan for individuals and small setups",
    pro: "Professional plan for growing businesses",
    max: "Serious Business plan for scaling operations",
  }

  const displayPlanTitle = isExpired
    ? `${planTitles[storedPlan] || storedPlan} (Expired)`
    : planTitles[effectivePlan] || effectivePlan

  return (
    <div className="space-y-6">
      {/* ─── Approaching Expiry Warning Alert ────────────────────────────── */}
      {details.is_approaching_expiry && details.days_until_expiry !== null && (
        <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold">Subscription Expiring Soon</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <span>
              Your {planTitles[storedPlan] || storedPlan} plan expires in{" "}
              <strong>{details.days_until_expiry} day(s)</strong> on{" "}
              {formatDate(details.current_period_end)}. Renew now to extend your subscription seamlessly.
            </span>
            <LoadingButton
              onClick={handleRenew}
              loading={isRenewing}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              Renew Now
            </LoadingButton>
          </AlertDescription>
        </Alert>
      )}

      {/* ─── Expired Subscription Info Banner ─────────────────────────────── */}
      {isExpired && (
        <Alert className="border-rose-500/50 bg-rose-500/10 text-rose-900 dark:text-rose-200">
          <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <AlertTitle className="font-semibold">Your Subscription Has Expired</AlertTitle>
          <AlertDescription className="mt-1 space-y-2">
            <p>
              Your <strong>{planTitles[storedPlan] || storedPlan}</strong> subscription expired on{" "}
              {formatDate(details.current_period_end)}. Your account is currently on the{" "}
              <strong>Personal</strong> plan.
            </p>
            <p className="text-xs opacity-90">
              Your existing data remains fully accessible, but Personal plan limits apply to new usage.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* ─── Over-Limit Warnings Banner ────────────────────────────────────── */}
      {details.over_limit_warnings && details.over_limit_warnings.length > 0 && (
        <div className="space-y-3">
          {details.over_limit_warnings.map((warn) => (
            <Alert key={`warn-${warn.feature}`} variant="destructive" className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="font-semibold">{warn.label} Exceed Personal Limit</AlertTitle>
              <AlertDescription className="text-xs mt-1">{warn.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* ─── Main Subscription Summary Header Card ────────────────────────── */}
      <Card className="relative overflow-hidden border-2 shadow-sm">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
          <Crown className="w-32 h-32" />
        </div>

        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <CardTitle className="text-2xl font-bold tracking-tight">
                  {displayPlanTitle}
                </CardTitle>
                {getStatusBadge(details.status, !!details.cancel_at_period_end)}
              </div>
              <CardDescription>
                {planDescriptions[effectivePlan] || "Account subscription overview"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm px-3 py-1 font-medium">
                {billingInterval} Billing
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Billing & Date Info */}
          {!isPersonal && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4 text-sm border">
              <div>
                <span className="text-muted-foreground block text-xs font-medium uppercase tracking-wider">
                  Current Period
                </span>
                <span className="font-medium">
                  {formatDate(details.current_period_start)} &rrArr; {formatDate(details.current_period_end)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs font-medium uppercase tracking-wider">
                  {details.cancel_at_period_end ? "Expiry Date" : "Next Renewal Date"}
                </span>
                <span className="font-medium">
                  {formatDate(details.current_period_end)}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {/* Personal User */}
            {isPersonal && !isExpired && (
              <Button onClick={handleUpgrade} className="gap-2">
                <Zap className="h-4 w-4" /> Upgrade to Pro
              </Button>
            )}

            {/* Expired User */}
            {isExpired && (
              <>
                <LoadingButton
                  onClick={handleRenew}
                  loading={isRenewing}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <RefreshCw className="h-4 w-4" /> Renew {planTitles[storedPlan] || storedPlan}
                </LoadingButton>
                <Button onClick={handleUpgrade} variant="outline" className="gap-2">
                  <ArrowUpRight className="h-4 w-4" /> View Plans
                </Button>
              </>
            )}

            {/* Active Pro User */}
            {isPro && !isExpired && (
              <>
                <LoadingButton
                  onClick={handleRenew}
                  loading={isRenewing}
                  variant="default"
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" /> Renew Subscription
                </LoadingButton>
                <Button onClick={handleUpgrade} variant="outline" className="gap-2">
                  <Crown className="h-4 w-4" /> Upgrade to Max
                </Button>
              </>
            )}

            {/* Active Max User */}
            {isMax && !isExpired && (
              <LoadingButton
                onClick={handleRenew}
                loading={isRenewing}
                variant="default"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" /> Renew Subscription
              </LoadingButton>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Plan Usage & Benefits Section ────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your Plan Benefits & Usage</h2>
          <p className="text-muted-foreground text-xs">
            Overview of resource limits and active feature quotas under your current {planTitles[effectivePlan]} plan.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Companies */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Companies</span>
              <Badge variant="outline" className="text-xs">
                Resource
              </Badge>
            </div>
            <div className="text-2xl font-bold">
              {usage.companies ?? 0} / {limits.companies ?? "Unlimited"}
            </div>
          </Card>

          {/* Staff */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Staff Members</span>
              <Badge variant="outline" className="text-xs">
                Resource
              </Badge>
            </div>
            <div className="text-2xl font-bold">
              {usage.staff ?? 0} / {limits.staff ?? "Unlimited"}
            </div>
          </Card>

          {/* Products */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Products</span>
              <Badge variant="outline" className="text-xs">
                Resource
              </Badge>
            </div>
            <div className="text-2xl font-bold">
              {usage.products ?? 0} / {limits.products ?? "Unlimited"}
            </div>
          </Card>

          {/* Customers */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Customers</span>
              <Badge variant="outline" className="text-xs">
                Resource
              </Badge>
            </div>
            <div className="text-2xl font-bold">
              {usage.customers ?? 0} / {limits.customers ?? "Unlimited"}
            </div>
          </Card>

          {/* Documents / month */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Documents</span>
              <Badge variant="outline" className="text-xs">
                Monthly Quota
              </Badge>
            </div>
            <div className="text-2xl font-bold">
              {usage.documents?.used ?? 0} / {limits.documents ?? "Unlimited"}
            </div>
            <span className="text-xs text-muted-foreground">Used this calendar month</span>
          </Card>

          {/* OCR scans */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>OCR Scans</span>
              <Badge variant="outline" className="text-xs">
                Monthly Quota
              </Badge>
            </div>
            <div className="text-2xl font-bold">
              {usage.ocr?.used ?? 0} / {limits.ocr ?? "Unlimited"}
            </div>
            <span className="text-xs text-muted-foreground">Used this calendar month</span>
          </Card>

          {/* AI Summary */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>AI Summary</span>
              <Badge variant="outline" className="text-xs">
                Cooldown
              </Badge>
            </div>
            <div className="text-xl font-bold">
              {limits.ai_summary === null
                ? "Unlimited"
                : usage.ai_summary?.available
                ? "Available"
                : "In Cooldown"}
            </div>
            <span className="text-xs text-muted-foreground">
              {limits.ai_summary === null
                ? "Unlimited access"
                : usage.ai_summary?.available
                ? "1 summary per 24 hours"
                : `Next available: ${formatShortDate(usage.ai_summary?.next_available_at)}`}
            </span>
          </Card>

          {/* Recurring Invoices */}
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Recurring Invoices</span>
              <Badge variant="outline" className="text-xs">
                Feature Access
              </Badge>
            </div>
            <div className="text-xl font-bold">
              {limits.recurring_invoices === null ? "Unlimited" : "Not Included"}
            </div>
            <span className="text-xs text-muted-foreground">
              {limits.recurring_invoices === null
                ? "Full recurring schedule automation"
                : "Upgrade to Pro to unlock"}
            </span>
          </Card>
        </div>
      </div>

      {/* ─── Subscription History Section ─────────────────────────────────── */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Subscription History</h2>
            <p className="text-xs text-muted-foreground">
              Past plan transitions and recorded subscription periods.
            </p>
          </div>
        </div>

        {details.subscription_history && details.subscription_history.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.subscription_history.map((item, idx) => (
                  <TableRow key={`sub-hist-${item.created_at || idx}`}>
                    <TableCell className="font-medium">{item.plan}</TableCell>
                    <TableCell>{item.billing_interval || "-"}</TableCell>
                    <TableCell>{item.period || formatDate(item.created_at)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={item.status === "Active" ? "default" : "outline"}
                        className="text-xs"
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No prior subscription history recorded.</p>
        )}
      </Card>

      {/* ─── Payment History Section ────────────────────────────────────────── */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Payment History</h2>
            <p className="text-xs text-muted-foreground">
              Verified payment transactions and CHIP Collect checkout records.
            </p>
          </div>
        </div>

        {details.payment_history && details.payment_history.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Billing Interval</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.payment_history.map((pay) => (
                  <TableRow key={pay.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {formatShortDate(pay.paid_at || pay.created_at)}
                    </TableCell>
                    <TableCell className="capitalize">{pay.plan}</TableCell>
                    <TableCell className="capitalize">{pay.billing_interval}</TableCell>
                    <TableCell className="font-medium">
                      {formatPrice(pay.amount, pay.currency)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {pay.reference}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          pay.status === "paid"
                            ? "default"
                            : pay.status === "pending"
                            ? "outline"
                            : "destructive"
                        }
                        className="text-xs capitalize"
                      >
                        {pay.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No payment transaction records found.</p>
        )}
      </Card>
    </div>
  )
}

