import { Link as RouterLink } from "@tanstack/react-router"
import {
  ChevronsUpDown,
  Compass,
  LogOut,
  MotionIconConfig,
  Settings,
  Zap,
} from "lucide-react-motion"
import { SubscriptionBadge } from "@/components/Common/SubscriptionBadge"
import { useTour } from "@/components/Tour/useTour"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import useSubscription from "@/hooks/useSubscription"
import { getInitials } from "@/utils"

interface UserInfoProps {
  fullName?: string
  /** When true, shows the subscription badge; when false, shows the email. */
  showBadge?: boolean
  email?: string
  subscriptionPlan?: string
  subscriptionLoading?: boolean
}

function UserInfo({
  fullName,
  email,
  showBadge = false,
  subscriptionPlan = "personal",
  subscriptionLoading = false,
}: UserInfoProps) {
  return (
    <div className="flex items-center gap-2.5 w-full min-w-0">
      <Avatar className="size-8">
        <AvatarFallback className="bg-zinc-600 text-white">
          {getInitials(fullName || "User")}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-start min-w-0">
        <p className="text-sm font-medium truncate w-full">{fullName}</p>
        {showBadge ? (
          <SubscriptionBadge
            plan={subscriptionPlan}
            isLoading={subscriptionLoading}
          />
        ) : (
          <p className="text-xs text-muted-foreground truncate w-full">
            {email}
          </p>
        )}
      </div>
    </div>
  )
}

export function User({ user }: { user: any }) {
  const { logout } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const { startTour } = useTour()
  const { subscription, isLoading: subscriptionLoading } = useSubscription()

  if (!user) return null

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }
  const handleLogout = async () => {
    logout()
  }

  const handleTakeTourAgain = () => {
    handleMenuClick()
    startTour()
  }

  return (
    <MotionIconConfig trigger="parent-hover">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                data-testid="user-menu"
                data-motion-icon-group
              >
                {/* Trigger: name + subscription badge (no email here) */}
                <UserInfo
                  fullName={user?.full_name}
                  email={user?.email}
                  showBadge
                  subscriptionPlan={subscription.plan}
                  subscriptionLoading={subscriptionLoading}
                />
                <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                {/* Dropdown header: name + email (full info) */}
                <UserInfo fullName={user?.full_name} email={user?.email} />
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <RouterLink to="/settings" onClick={handleMenuClick}>
                <DropdownMenuItem data-motion-icon-group>
                  <Settings />
                  User Settings
                </DropdownMenuItem>
              </RouterLink>
              <RouterLink to="/upgrade" onClick={handleMenuClick}>
                <DropdownMenuItem data-motion-icon-group>
                  <Zap />
                  Upgrade Plan
                </DropdownMenuItem>
              </RouterLink>
              <DropdownMenuItem
                data-motion-icon-group
                onClick={handleTakeTourAgain}
              >
                <Compass />
                Show Me Around
              </DropdownMenuItem>
              <DropdownMenuItem data-motion-icon-group onClick={handleLogout}>
                <LogOut />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </MotionIconConfig>
  )
}
