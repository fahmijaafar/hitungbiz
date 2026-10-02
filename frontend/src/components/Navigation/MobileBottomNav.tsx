import { Link, useRouterState } from "@tanstack/react-router"
import {
  FileText,
  House,
  Menu,
  TrendingDown,
  TrendingUp,
} from "lucide-react-motion"
import { useEffect } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function MobileBottomNav() {
  const { openMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname

  const isHomeActive = currentPath === "/"
  const isSalesActive =
    currentPath === "/sales" || currentPath.startsWith("/sales/")
  const isPurchasesActive =
    currentPath === "/purchases" || currentPath.startsWith("/purchases/")
  const isDocumentsActive =
    currentPath === "/documents" || currentPath.startsWith("/documents/")
  const isMoreActive =
    openMobile ||
    (!isHomeActive &&
      !isSalesActive &&
      !isPurchasesActive &&
      !isDocumentsActive)

  const navItems = [
    {
      label: "Home",
      path: "/",
      icon: House,
      isActive: isHomeActive,
      isButton: false,
    },
    {
      label: "Money In",
      path: "/sales",
      icon: TrendingUp,
      isActive: isSalesActive,
      isButton: false,
    },
    {
      label: "Money Out",
      path: "/purchases",
      icon: TrendingDown,
      isActive: isPurchasesActive,
      isButton: false,
    },
    {
      label: "Documents",
      path: "/documents",
      icon: FileText,
      isActive: isDocumentsActive,
      isButton: false,
    },
    {
      label: "More",
      icon: Menu,
      isActive: isMoreActive,
      isButton: true,
      onClick: () => setOpenMobile(!openMobile),
    },
  ]

  const scrollToTop = (smooth = true) => {
    const mainEl =
      document.getElementById("app-main") || document.querySelector("main")
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" })
    }
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" })
  }

  // Ensure every route change resets the main container scroll to top
  useEffect(() => {
    scrollToTop(false)
  }, [scrollToTop])

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className={cn(
        "fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-3.5 right-3.5 z-40 md:hidden",
        "mx-auto max-w-md",
      )}
    >
      <div className="flex items-center justify-around rounded-full border border-border/80 bg-background/85 p-1.5 shadow-2xl backdrop-blur-xl dark:bg-zinc-900/90 dark:border-zinc-800/80">
        {navItems.map((item) => {
          const Icon = item.icon
          const isTrendingUp = item.icon === TrendingUp
          const isTrendingDown = item.icon === TrendingDown

          const activeIconColor = isTrendingUp
            ? "text-emerald-500 dark:text-emerald-400"
            : isTrendingDown
              ? "text-rose-500 dark:text-rose-400"
              : "text-primary dark:text-primary-foreground"

          const activeBgColor = isTrendingUp
            ? "bg-emerald-500/10 dark:bg-emerald-500/20"
            : isTrendingDown
              ? "bg-rose-500/10 dark:bg-rose-500/20"
              : "bg-primary/10 dark:bg-primary/20"

          const content = (
            <div
              className={cn(
                "flex items-center justify-center rounded-full p-2 transition-all duration-200 select-none",
                item.isActive
                  ? cn(
                      activeBgColor,
                      activeIconColor,
                      "font-semibold shadow-xs",
                    )
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
              title={item.label}
            >
              <Icon
                className={cn(
                  "size-5 transition-transform duration-200",
                  item.isActive && "scale-110",
                )}
              />
            </div>
          )

          if (item.isButton) {
            return (
              <button
                key={item.label}
                type="button"
                aria-label={item.label}
                onClick={item.onClick}
                className="flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
              >
                {content}
              </button>
            )
          }

          return (
            <Link
              key={item.label}
              to={item.path}
              aria-label={item.label}
              onClick={() => {
                setOpenMobile(false)
                if (item.isActive) {
                  scrollToTop(true)
                  setTimeout(() => scrollToTop(true), 10)
                }
              }}
              className="flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            >
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default MobileBottomNav
