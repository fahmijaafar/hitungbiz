import { useEffect, useRef, useState } from "react"

export const DEFAULT_SPLASH_MESSAGES = [
  "Loading company...",
  "Syncing data...",
  "Preparing dashboard...",
  "Almost ready...",
]

export interface UseAppInitializationOptions {
  messages?: string[]
  rotationIntervalMs?: number
  minDisplayTimeMs?: number
  timeoutMs?: number
  onTimeout?: () => void
}

export function useAppInitialization(
  options: UseAppInitializationOptions = {},
) {
  const {
    messages = DEFAULT_SPLASH_MESSAGES,
    rotationIntervalMs = 700,
    minDisplayTimeMs = 500,
    timeoutMs = 15000,
    onTimeout,
  } = options

  const [messageIndex, setMessageIndex] = useState(0)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [isMounted, setIsMounted] = useState(true)
  const [isTimedOut, setIsTimedOut] = useState(false)

  const startTimeRef = useRef<number>(Date.now())

  // Rotate through loading messages every ~700ms
  useEffect(() => {
    if (!isMounted || isFadingOut) return

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length)
    }, rotationIntervalMs)

    return () => clearInterval(interval)
  }, [isMounted, isFadingOut, messages.length, rotationIntervalMs])

  // Prevent scrolling while splash screen is mounted
  useEffect(() => {
    if (!isMounted) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isMounted])

  // Manage minimum display time and transition out
  useEffect(() => {
    let fadeOutTimer: NodeJS.Timeout
    let unmountTimer: NodeJS.Timeout

    const elapsed = Date.now() - startTimeRef.current
    const delay = Math.max(0, minDisplayTimeMs - elapsed)

    fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true)
      // Remove from DOM after CSS scale down / fade animation completes (300ms)
      unmountTimer = setTimeout(() => {
        setIsMounted(false)
      }, 300)
    }, delay)

    return () => {
      clearTimeout(fadeOutTimer)
      clearTimeout(unmountTimer)
    }
  }, [minDisplayTimeMs])

  // 15-second Timeout protection
  useEffect(() => {
    if (!isMounted || isFadingOut) return

    const timeoutTimer = setTimeout(() => {
      setIsTimedOut(true)
      if (onTimeout) {
        onTimeout()
      } else {
        window.location.href = "/offline.html"
      }
    }, timeoutMs)

    return () => clearTimeout(timeoutTimer)
  }, [isMounted, isFadingOut, timeoutMs, onTimeout])

  return {
    currentMessage: messages[messageIndex],
    isFadingOut,
    isMounted,
    isTimedOut,
  }
}
