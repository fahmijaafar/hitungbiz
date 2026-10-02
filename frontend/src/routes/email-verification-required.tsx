import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { AuthService, UsersService } from "@/client"
import { AuthLayout } from "@/components/Common/AuthLayout"
import { Button } from "@/components/ui/button"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/email-verification-required")({
  component: EmailVerificationRequired,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
    // If already verified, redirect appropriately
    const user = await UsersService.readUserMe()
    if (user.email_verified) {
      if (!user.company_id) {
        throw redirect({ to: "/onboarding" })
      }
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [{ title: `Verify Your Email - ${APP_NAME}` }],
  }),
})

const COOLDOWN_SECONDS = 60

function EmailVerificationRequired() {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { logout } = useAuth()

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: UsersService.readUserMe,
    enabled: isLoggedIn(),
  })

  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)

  // Countdown timer
  useEffect(() => {
    if (!lastSentAt) return
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastSentAt) / 1000)
      const remaining = COOLDOWN_SECONDS - elapsed
      if (remaining <= 0) {
        setCooldownRemaining(0)
        clearInterval(interval)
      } else {
        setCooldownRemaining(remaining)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lastSentAt])

  const resendMutation = useMutation({
    mutationFn: () => AuthService.resendVerification(),
    onSuccess: () => {
      showSuccessToast("Verification email sent! Check your inbox.")
      setLastSentAt(Date.now())
      setCooldownRemaining(COOLDOWN_SECONDS)
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "body" in err
          ? (err as { body?: { detail?: string } }).body?.detail
          : "Failed to send verification email. Please try again."
      showErrorToast(message ?? "Something went wrong.")
    },
  })

  const handleResend = () => {
    if (cooldownRemaining > 0 || resendMutation.isPending) return
    resendMutation.mutate()
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900">
          <svg
            className="h-8 w-8 text-teal-600 dark:text-teal-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a verification link to{" "}
            <span className="font-semibold text-foreground">
              {user?.email ?? "your email address"}
            </span>
          </p>
        </div>

        <div className="w-full max-w-sm rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Click the link in the email to verify your account. The link expires
          in <span className="font-medium text-foreground">24 hours</span>.
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3">
          <Button
            id="resend-verification-btn"
            onClick={handleResend}
            disabled={cooldownRemaining > 0 || resendMutation.isPending}
            className="w-full"
          >
            {resendMutation.isPending
              ? "Sending…"
              : cooldownRemaining > 0
                ? `Resend in ${cooldownRemaining}s`
                : "Resend verification email"}
          </Button>

          <Button
            id="logout-btn"
            variant="outline"
            className="w-full"
            onClick={logout}
          >
            Sign out
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Didn't get the email? Check your spam folder or click resend above.
        </p>
      </div>
    </AuthLayout>
  )
}

export default EmailVerificationRequired
