import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createFileRoute,
  Link as RouterLink,
  useNavigate,
  useSearch,
} from "@tanstack/react-router"
import { z } from "zod"
import { AuthService } from "@/client"
import { AuthLayout } from "@/components/Common/AuthLayout"
import { Button } from "@/components/ui/button"
import { isLoggedIn } from "@/hooks/useAuth"
import { APP_NAME } from "@/lib/app"

const searchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmail,
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: `Verify Email - ${APP_NAME}` }],
  }),
})

type VerifyState =
  | "verifying"
  | "success"
  | "already_verified"
  | "expired"
  | "invalid"
  | "error"
  | "no_token"

function VerifyEmail() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { token } = useSearch({ from: "/verify-email" })

  // useQuery deduplicates concurrent requests with the same key — this
  // naturally handles React StrictMode's double-mount without any manual guards.
  const { data, error, isLoading, isSuccess, isError } = useQuery({
    queryKey: ["verify-email", token],
    queryFn: () => AuthService.verifyEmail({ requestBody: { token: token! } }),
    enabled: !!token,
    retry: false,
    staleTime: Infinity, // Never re-fetch — verification is one-shot
    gcTime: 0, // Don't keep in cache after component unmounts
  })

  // Invalidate currentUser cache when verification succeeds so the rest of
  // the app sees the updated email_verified flag.
  if (isSuccess) {
    queryClient.invalidateQueries({ queryKey: ["currentUser"] })
  }

  const getState = (): VerifyState => {
    if (!token) return "no_token"
    if (isLoading) return "verifying"
    if (isSuccess) {
      const msg = (data as { message?: string })?.message ?? ""
      if (msg.toLowerCase().includes("already")) return "already_verified"
      return "success"
    }
    if (isError) {
      const err = error as { body?: { detail?: string }; status?: number }
      const detail = err?.body?.detail ?? ""
      if (
        detail.toLowerCase().includes("expired") ||
        detail.toLowerCase().includes("invalid or has expired")
      ) {
        return "expired"
      }
      return "invalid"
    }
    return "verifying"
  }

  const state = getState()

  const handleContinue = () => {
    navigate({ to: "/" })
  }

  const iconClass = "mx-auto h-12 w-12"

  const renderState = () => {
    switch (state) {
      case "verifying":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted animate-pulse">
              <svg
                className={`${iconClass} text-muted-foreground`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Verifying your email…</h1>
            <p className="text-muted-foreground text-sm">
              Please wait while we verify your email address.
            </p>
          </div>
        )

      case "success":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <svg
                className={`${iconClass} text-green-600 dark:text-green-400`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Email verified!</h1>
            <p className="text-muted-foreground text-sm">
              Your email has been verified successfully. You can now use all
              features of the app.
            </p>
            <Button
              id="continue-btn"
              className="w-full"
              onClick={handleContinue}
            >
              Continue to app
            </Button>
          </div>
        )

      case "already_verified":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
              <svg
                className={`${iconClass} text-blue-600 dark:text-blue-400`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Already verified</h1>
            <p className="text-muted-foreground text-sm">
              Your email address is already verified. You're all set!
            </p>
            <Button
              id="continue-already-btn"
              className="w-full"
              onClick={handleContinue}
            >
              Continue to app
            </Button>
          </div>
        )

      case "expired":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900">
              <svg
                className={`${iconClass} text-yellow-600 dark:text-yellow-400`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Link expired</h1>
            <p className="text-muted-foreground text-sm">
              This verification link has expired or has already been used.
              Request a new one below.
            </p>
            {isLoggedIn() ? (
              <RouterLink to="/email-verification-required" className="w-full">
                <Button id="request-new-btn" className="w-full">
                  Request new verification email
                </Button>
              </RouterLink>
            ) : (
              <RouterLink to="/login" className="w-full">
                <Button id="login-resend-btn" className="w-full">
                  Log in to request new link
                </Button>
              </RouterLink>
            )}
          </div>
        )

      case "invalid":
      case "error":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <svg
                className={`${iconClass} text-rose-600 dark:text-rose-400`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Invalid link</h1>
            <p className="text-muted-foreground text-sm">
              This verification link is invalid. Please request a new
              verification email.
            </p>
            {isLoggedIn() ? (
              <RouterLink to="/email-verification-required" className="w-full">
                <Button id="request-new-invalid-btn" className="w-full">
                  Request new verification email
                </Button>
              </RouterLink>
            ) : (
              <RouterLink to="/login" className="w-full">
                <Button id="login-btn" className="w-full">
                  Log in
                </Button>
              </RouterLink>
            )}
          </div>
        )

      case "no_token":
        return (
          <div className="flex flex-col items-center gap-4">
            <h1 className="text-2xl font-bold">No verification token</h1>
            <p className="text-muted-foreground text-sm">
              This page requires a verification token from your email. Please
              click the link in your verification email.
            </p>
            <RouterLink to="/login" className="w-full">
              <Button id="back-login-btn" className="w-full">
                Back to login
              </Button>
            </RouterLink>
          </div>
        )
    }
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-6 text-center">
        {renderState()}
      </div>
    </AuthLayout>
  )
}

export default VerifyEmail
