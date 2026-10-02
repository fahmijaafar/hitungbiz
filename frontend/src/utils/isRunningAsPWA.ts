/**
 * Detects if the application is running as an installed PWA on a mobile screen (<= 768px).
 *
 * Both conditions MUST be true:
 * 1. Application is running in standalone mode (installed PWA)
 * 2. Screen width is <= 768px (Mobile viewport)
 */
export function isRunningAsPWA(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone)

  const isMobileWidth = window.innerWidth <= 768

  return isStandalone && isMobileWidth
}
