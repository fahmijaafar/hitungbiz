import type React from "react"
import { useEffect, useState } from "react"
import { Logo } from "@/components/Common/Logo"
import {
  type UseAppInitializationOptions,
  useAppInitialization,
} from "@/hooks/useAppInitialization"
import { cn } from "@/lib/utils"
import { isRunningAsPWA } from "@/utils/isRunningAsPWA"

export interface SplashScreenProps extends UseAppInitializationOptions {
  /** Optional custom subheading below logo. Defaults to "Preparing your workspace..." */
  subheading?: string
  /** Optional custom logo element */
  logo?: React.ReactNode
  /** Optional custom additional content rendered at bottom */
  children?: React.ReactNode
  /** Additional wrapper class names */
  className?: string
}

export function SplashScreen({
  subheading = "Preparing your workspace...",
  logo,
  children,
  className,
  messages,
  rotationIntervalMs,
  minDisplayTimeMs,
  timeoutMs,
  onTimeout,
}: SplashScreenProps) {
  // Check PWA + Mobile conditions
  const [shouldRender, setShouldRender] = useState<boolean>(false)

  useEffect(() => {
    const isPWA = isRunningAsPWA()
    setShouldRender(isPWA)
    // Remove precached static HTML splash screen so React component seamlessly takes over
    const staticSplash = document.getElementById("pwa-initial-splash")
    if (staticSplash) {
      staticSplash.remove()
    }
  }, [])

  const { currentMessage, isFadingOut, isMounted } = useAppInitialization({
    messages,
    rotationIntervalMs,
    minDisplayTimeMs,
    timeoutMs,
    onTimeout,
  })

  // Do NOT render if not running as mobile PWA or after splash unmounts
  if (!shouldRender || !isMounted) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Application Loading"
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground select-none overflow-hidden px-6 transition-all duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-opacity",
        isFadingOut
          ? "opacity-0 scale-95 pointer-events-none"
          : "opacity-100 scale-100",
        className,
      )}
    >
      <div className="flex flex-col items-center max-w-sm w-full text-center space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center min-h-[48px]">
          {logo || <Logo asLink={false} className="h-10 w-auto" />}
        </div>

        {/* Subtitle */}
        <div className="space-y-1">
          <p className="text-base font-semibold tracking-tight text-foreground/90">
            {subheading}
          </p>
        </div>

        {/* Animated Spinner */}
        <div className="relative py-2" aria-hidden="true">
          <div className="h-9 w-9 rounded-full border-3 border-primary/20 border-t-primary animate-spin" />
        </div>

        {/* Dynamic Rotating Message with Fade Transition */}
        <div className="min-h-[24px] flex items-center justify-center">
          <p
            key={currentMessage}
            aria-live="polite"
            className="text-sm font-medium text-muted-foreground animate-in fade-in duration-200"
          >
            {currentMessage}
          </p>
        </div>

        {/* Future Extensibility / Extra Content Slot */}
        {children}
      </div>
    </div>
  )
}

export default SplashScreen
