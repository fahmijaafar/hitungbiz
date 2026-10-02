import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Check, RefreshCw } from "lucide-react-motion"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import useSubscription from "@/hooks/useSubscription"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/payment/success")({
  component: PaymentSuccessPage,
  head: () => ({
    meta: [{ title: `Payment Success - ${APP_NAME}` }],
  }),
})

function PaymentSuccessPage() {
  const queryClient = useQueryClient()
  const { subscription } = useSubscription()
  const [pollCount, setPollCount] = useState(0)

  useEffect(() => {
    // Poll subscription endpoint every 2 seconds for up to 20 seconds to catch webhook activation
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["subscription"] })
      setPollCount((prev) => prev + 1)
    }, 2000)

    if (
      pollCount >= 10 ||
      (subscription.effective_plan &&
        subscription.effective_plan !== "personal")
    ) {
      clearInterval(interval)
    }

    return () => clearInterval(interval)
  }, [queryClient, pollCount, subscription.effective_plan])

  const isActivated = Boolean(
    subscription.effective_plan && subscription.effective_plan !== "personal",
  )

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl border bg-card p-8 shadow-lg">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
          <Check className="size-10" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Payment Received!
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Thank you for your payment. Your subscription is being activated by
            our system.
          </p>
        </div>

        {isActivated ? (
          <div className="w-full rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 border border-emerald-200 dark:border-emerald-800">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Subscription Active: {subscription.effective_plan?.toUpperCase()}{" "}
              Plan
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              All entitlements and higher resource limits are now available.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-4 animate-spin text-primary" />
            <span>Confirming payment activation with server...</span>
          </div>
        )}

        <div className="flex w-full flex-col gap-2 pt-2">
          <Link to="/">
            <Button className="w-full gap-2">
              Go to Dashboard <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link to="/upgrade">
            <Button variant="outline" className="w-full">
              View Subscription Details
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
