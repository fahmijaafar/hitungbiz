import { createFileRoute, Link } from "@tanstack/react-router"
import { RefreshCw, X } from "lucide-react-motion"
import { Button } from "@/components/ui/button"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/payment/failure")({
  component: PaymentFailurePage,
  head: () => ({
    meta: [{ title: `Payment Failed - ${APP_NAME}` }],
  }),
})

function PaymentFailurePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl border bg-card p-8 shadow-lg">
        <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <X className="size-10" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Payment Unsuccessful
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The payment gateway was unable to process your payment attempt. No
            charges were made to your account.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 pt-2">
          <Link to="/upgrade">
            <Button className="w-full gap-2">
              <RefreshCw className="size-4" /> Try Again
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" className="w-full">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
