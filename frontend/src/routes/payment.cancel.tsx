import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, X } from "lucide-react-motion"
import { Button } from "@/components/ui/button"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/payment/cancel")({
  component: PaymentCancelPage,
  head: () => ({
    meta: [{ title: `Payment Cancelled - ${APP_NAME}` }],
  }),
})

function PaymentCancelPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl border bg-card p-8 shadow-lg">
        <div className="flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <X className="size-10" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Checkout Cancelled
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You cancelled the checkout process. Your plan remains unchanged and
            no charges were made.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 pt-2">
          <Link to="/upgrade">
            <Button className="w-full gap-2">
              <ArrowLeft className="size-4" /> Return to Upgrade Page
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
