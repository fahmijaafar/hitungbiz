import {
  Banknote,
  Briefcase,
  CalendarClock,
  ChartNoAxesColumn as FileBarChart,
  FileText,
  House as Home,
  Landmark,
  LayoutTemplate,
  ListChecks,
  Mail,
  Package,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Upload,
  User as UserIcon,
  Users,
} from "lucide-react-motion"

import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { Main, type NavGroup } from "./Main"
import { User } from "./User"

const baseGroups: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { id: "sidebar-dashboard", icon: Home, title: "Dashboard", path: "/" },
      {
        id: "sidebar-tax",
        icon: Landmark,
        title: "LHDN Tax Advisor",
        path: "/tax-advisor",
      },
      {
        icon: FileBarChart,
        title: "Financial Reports",
        path: "/financial-reports",
      },
    ],
  },

  {
    title: "Management",
    items: [
      {
        id: "sidebar-companies",
        icon: Briefcase,
        title: "Companies",
        path: "/companies",
      },
      {
        id: "sidebar-staff",
        icon: UserIcon,
        title: "Staff",
        path: "/staff",
      },
      {
        id: "sidebar-clients",
        icon: Users,
        title: "Clients",
        path: "/clients",
      },
      {
        id: "sidebar-products",
        icon: Package,
        title: "Products",
        path: "/products",
      },
      { icon: Banknote, title: "Bank Accounts", path: "/bank-accounts" },
    ],
  },
  {
    title: "Transactions",
    items: [
      {
        id: "sidebar-transactions",
        icon: ListChecks,
        title: "Transactions",
        path: "/transactions",
      },
      {
        id: "sidebar-revenue",
        icon: TrendingUp,
        title: "Revenue",
        path: "/sales",
      },
      {
        id: "sidebar-expenses",
        icon: TrendingDown,
        title: "Expenses",
        path: "/purchases",
      },
      {
        id: "sidebar-import",
        icon: Upload,
        title: "Import",
        path: "/import-transactions",
      },
      {
        id: "sidebar-bank-reconciliation",
        icon: Landmark,
        title: "Bank Reconciliation",
        path: "/bank-reconciliation",
      },
    ],
  },
  {
    title: "Documents",
    items: [
      {
        id: "sidebar-documents",
        icon: FileText,
        title: "Documents",
        path: "/documents",
      },
      {
        id: "sidebar-recurring-invoices",
        icon: CalendarClock,
        title: "Recurring Invoices",
        path: "/recurring-invoices",
      },
      {
        icon: LayoutTemplate,
        title: "Document Settings",
        path: "/document-settings",
      },
    ],
  },
]

export function AppSidebar() {
  const { user: currentUser } = useAuth()

  const groups = currentUser?.is_superuser
    ? [
        ...baseGroups,
        {
          title: "System",
          items: [
            { icon: UserIcon, title: "Admin", path: "/admin" },
            { icon: Mail, title: "Email Blasting", path: "/email-blasting" },
            { icon: ShieldCheck, title: "Audit Logs", path: "/audit-logs" },
          ],
        },
      ]
    : baseGroups

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="relative px-4 py-5 md:py-6 flex items-center justify-center md:justify-start border-b border-sidebar-border/30 md:border-b-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        <Main groups={groups} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/30 pt-2.5 pb-3 px-2 gap-1.5 flex flex-col md:border-t-0 md:pt-0 md:pb-0">
        <SidebarAppearance />
        <User user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
