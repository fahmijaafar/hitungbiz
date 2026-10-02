import { type Config, type Driver, driver } from "driver.js"
import "driver.js/dist/driver.css"
import type React from "react"
import { createContext, useCallback, useEffect, useRef, useState } from "react"
import { UsersService } from "@/client"
import { useSidebar } from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { TOUR_STEPS } from "./TourSteps"

export interface TourContextType {
  startTour: () => void
  stopTour: () => void
  isTourActive: boolean
}

export const TourContext = createContext<TourContextType>({
  startTour: () => {},
  stopTour: () => {},
  isTourActive: false,
})

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const [isTourActive, setIsTourActive] = useState(false)
  const driverRef = useRef<Driver | null>(null)
  const tourStartedRef = useRef(false)

  const markCompleted = useCallback(async () => {
    try {
      await UsersService.updateUserMe({
        requestBody: {
          has_completed_tour: true,
          completed_tour_at: new Date().toISOString(),
        },
      })
    } catch (err) {
      console.error("Failed to update user tour completion:", err)
    }
  }, [])

  const stopTour = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy()
      driverRef.current = null
    }
    if (isMobile) {
      setOpenMobile(false)
    }
    setIsTourActive(false)
  }, [isMobile, setOpenMobile])

  const startTour = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy()
    }

    const driverSteps: Config["steps"] = TOUR_STEPS.map((step, index) => {
      const isFirst = index === 0
      const isLast = index === TOUR_STEPS.length - 1

      return {
        element: step.element,
        popover: {
          title: step.title,
          description: step.description.replace(/\n/g, "<br/>"),
          side: step.side || "right",
          align: step.align || "center",
          popoverClass: "hitungbiz-tour-popover",
          showButtons: isFirst
            ? ["next", "close"]
            : ["next", "previous", "close"],
          nextBtnText: isLast ? "Finish 🎉" : "Next",
          prevBtnText: "Previous",
        },
      }
    })

    const driverInstance = driver({
      animate: true,
      overlayColor: "rgba(9, 9, 11, 0.8)",
      stagePadding: 6,
      stageRadius: 10,
      allowClose: true,
      disableActiveInteraction: true,
      popoverClass: "hitungbiz-tour-popover",
      steps: driverSteps,
      onHighlightStarted: (_element, step) => {
        if (isMobile) {
          if (step?.element) {
            setOpenMobile(true)
          } else {
            setOpenMobile(false)
          }
        }

        const scrollSidebar = () => {
          const sidebarContent = document.querySelector(
            '[data-sidebar="content"]',
          )
          if (
            sidebarContent &&
            step?.element &&
            typeof step.element === "string"
          ) {
            const stepSelector = step.element
            const bottomSteps = [
              "#sidebar-revenue",
              "#sidebar-expenses",
              "#sidebar-import",
              "#sidebar-bank-reconciliation",
              "#sidebar-documents",
              "#sidebar-recurring-invoices",
            ]
            if (bottomSteps.includes(stepSelector)) {
              sidebarContent.scrollTop = sidebarContent.scrollHeight
            } else {
              sidebarContent.scrollTop = 0
            }
          }
        }

        scrollSidebar()
        requestAnimationFrame(scrollSidebar)
      },
      onDestroyed: () => {
        if (isMobile) {
          setOpenMobile(false)
        }
        setIsTourActive(false)
        driverRef.current = null
        markCompleted()
      },
      onPopoverRender: (popover) => {
        // Add Skip Tour button alongside navigation controls
        const footer = popover.wrapper.querySelector(".driver-popover-footer")
        if (footer && !footer.querySelector(".hitungbiz-tour-skip-btn")) {
          const skipBtn = document.createElement("button")
          skipBtn.type = "button"
          skipBtn.className = "hitungbiz-tour-skip-btn"
          skipBtn.innerText = "Skip Tour"
          skipBtn.onclick = () => {
            driverInstance.destroy()
          }
          footer.insertBefore(skipBtn, footer.firstChild)
        }
      },
    })

    driverRef.current = driverInstance
    setIsTourActive(true)

    // Small delay to ensure DOM sidebar elements are fully rendered
    setTimeout(() => {
      driverInstance.drive()
    }, 150)
  }, [isMobile, setOpenMobile, markCompleted])

  // Auto-start for first time users who haven't completed tour
  useEffect(() => {
    if (
      user?.company_id &&
      !user.has_completed_tour &&
      !tourStartedRef.current &&
      !isTourActive
    ) {
      tourStartedRef.current = true
      // Trigger after page mount
      const timer = setTimeout(() => {
        startTour()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [user, isTourActive, startTour])

  return (
    <TourContext.Provider value={{ startTour, stopTour, isTourActive }}>
      {children}
    </TourContext.Provider>
  )
}

export default TourProvider
