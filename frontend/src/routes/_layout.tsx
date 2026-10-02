import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { UsersService } from "@/client"
import { Footer } from "@/components/Common/Footer"
import CompanySwitcher from "@/components/Companies/CompanySwitcher"
import MobileBottomNav from "@/components/Navigation/MobileBottomNav"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import TourProvider from "@/components/Tour/TourProvider"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }

    try {
      const user = await UsersService.readUserMe()

      // Block unverified users before any protected content
      if (!user.email_verified) {
        throw redirect({
          to: "/email-verification-required",
        })
      }

      if (!user.company_id) {
        throw redirect({
          to: "/onboarding",
        })
      }
      if (user.company_id) {
        localStorage.setItem("company_id", user.company_id)
      }
      if (user.role) {
        localStorage.setItem("role", user.role)
      }
    } catch (error) {
      // Re-throw redirect errors from TanStack Router
      if (error && typeof error === "object" && "to" in error) {
        throw error
      }
      // If fetching user fails (e.g. token expired), redirect to login
      localStorage.removeItem("access_token")
      localStorage.removeItem("company_id")
      localStorage.removeItem("role")
      throw redirect({
        to: "/login",
      })
    }
  },
  component: Layout,
})

function Layout() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <TourProvider>
        <AppSidebar />
        <SidebarInset className="h-svh flex flex-col overflow-hidden min-w-0">
          <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4 dark:bg-black">
            <SidebarTrigger className="-ml-1 text-muted-foreground" />
            <div className="flex flex-1" />
            <CompanySwitcher />
          </header>
          <main
            id="app-main"
            className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col justify-between"
          >
            <div className="w-full flex-1 px-6 pt-6 md:px-8 md:pt-8">
              <Outlet />
            </div>
            <Footer className="shrink-0 mt-6 pb-16 md:pb-4" />
          </main>
        </SidebarInset>
        <MobileBottomNav />
      </TourProvider>
    </SidebarProvider>
  )
}

export default Layout
