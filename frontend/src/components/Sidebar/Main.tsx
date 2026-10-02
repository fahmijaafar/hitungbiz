import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import {
  ChevronDown,
  MotionIconConfig,
  TrendingDown,
  TrendingUp,
} from "lucide-react-motion"
import * as React from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type NavItem = {
  icon: React.ComponentType<any>
  title: string
  path: string
  id?: string
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

interface MainProps {
  groups: NavGroup[]
}

const getActiveIconColorClass = (itemIcon: any, path: string) => {
  if (itemIcon === TrendingUp || path === "/sales") {
    return "text-emerald-500 dark:text-emerald-400"
  }
  if (itemIcon === TrendingDown || path === "/purchases") {
    return "text-rose-500 dark:text-rose-400"
  }
  return "text-primary"
}

export function Main({ groups }: MainProps) {
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouterState()
  const currentPath = router.location.pathname

  // Track expanded groups for mobile view
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {
        Overview: true,
        Management: true,
        Transactions: true,
        Documents: true,
        System: true,
      }
      return initial
    },
  )

  // Ensure active group is automatically expanded on route change
  React.useEffect(() => {
    const activeGroup = groups.find((g) =>
      g.items.some((item) => item.path === currentPath),
    )
    if (activeGroup && activeGroup.title !== "Overview") {
      setOpenGroups((prev) => ({
        ...prev,
        [activeGroup.title]: true,
      }))
    }
  }, [currentPath, groups])

  const toggleGroup = (title: string) => {
    if (title === "Overview") return
    setOpenGroups((prev) => ({
      ...prev,
      [title]: !prev[title],
    }))
  }

  const handleMenuClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // Mobile navigation rendering
  if (isMobile) {
    return (
      <MotionIconConfig trigger="parent-hover">
        <div className="flex flex-col gap-1 py-1.5 px-1.5">
          {groups.map((group) => {
            const isOverview = group.title === "Overview"
            const isExpanded = isOverview || !!openGroups[group.title]

            return (
              <div key={group.title} className="flex flex-col">
                {/* Section Header */}
                {isOverview ? (
                  <div className="px-3 pt-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 select-none">
                    {group.title}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    className="flex w-full items-center justify-between px-3 pt-3.5 pb-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors focus:outline-none select-none"
                  >
                    <span>{group.title}</span>
                    <ChevronDown
                      className={cn(
                        "size-3.5 text-sidebar-foreground/40 transition-transform duration-200 ease-in-out",
                        isExpanded ? "rotate-180" : "rotate-0",
                      )}
                    />
                  </button>
                )}

                {/* Section Items (Collapsible Grid) */}
                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                    isExpanded
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      {group.items.map((item) => {
                        const isActive = currentPath === item.path
                        const ItemIcon = item.icon

                        return (
                          <RouterLink
                            key={item.title}
                            id={item.id}
                            to={item.path}
                            onClick={handleMenuClick}
                            className={cn(
                              "group/mobile-item flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors select-none border-l-[3px]",
                              isActive
                                ? "border-l-primary bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs"
                                : "border-l-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                            )}
                          >
                            <div className="flex size-5 shrink-0 items-center justify-center">
                              <ItemIcon
                                className={cn(
                                  "size-[17px] shrink-0",
                                  isActive &&
                                    getActiveIconColorClass(
                                      ItemIcon,
                                      item.path,
                                    ),
                                )}
                              />
                            </div>
                            <span className="truncate">{item.title}</span>
                          </RouterLink>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </MotionIconConfig>
    )
  }

  // Desktop navigation rendering
  return (
    <MotionIconConfig trigger="parent-hover">
      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = currentPath === item.path

                return (
                  <div
                    key={item.title}
                    className={`relative ${isActive ? "border-l-[3px] border-l-primary rounded-sm" : ""}`}
                  >
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={isActive}
                        asChild
                        data-motion-icon-group
                      >
                        <RouterLink
                          id={item.id}
                          to={item.path}
                          onClick={handleMenuClick}
                        >
                          <item.icon
                            className={cn(
                              isActive &&
                                getActiveIconColorClass(item.icon, item.path),
                            )}
                          />
                          <span>{item.title}</span>
                        </RouterLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </div>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </MotionIconConfig>
  )
}
