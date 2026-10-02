import { useQuery } from "@tanstack/react-query"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileX,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react-motion"
import { useState } from "react"
import { type AuditLogPublic, AuditLogsService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DateInput } from "@/components/ui/date-input"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTimeDMY } from "@/lib/utils"
import { AuditLogDetailDrawer } from "./AuditLogDetailDrawer"

const MODULE_OPTIONS = [
  "Dashboard",
  "Companies",
  "Clients",
  "Products",
  "Bank Accounts",
  "Revenue",
  "Expenses",
  "Transactions",
  "Documents",
  "Recurring Invoices",
  "Imports",
  "Bank Reconciliation",
  "Financial Reports",
  "LHDN Tax Advisor",
  "Email Blasting",
  "Admin",
  "Authentication",
  "Settings",
  "System",
]

const ACTION_OPTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "RESTORE",
  "STATUS_CHANGE",
  "LOGIN",
  "LOGOUT",
  "IMPORT",
  "EXPORT",
  "SEND",
  "DOWNLOAD",
  "GENERATE",
  "PAYMENT",
  "SYNC",
  "AI_REQUEST",
]

export function AuditLogsTable() {
  const [keyword, setKeyword] = useState("")
  const [selectedModule, setSelectedModule] = useState<string>("ALL")
  const [selectedAction, setSelectedAction] = useState<string>("ALL")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [selectedLog, setSelectedLog] = useState<AuditLogPublic | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const skip = (page - 1) * limit

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: [
      "audit-logs",
      {
        skip,
        limit,
        keyword,
        module: selectedModule,
        action: selectedAction,
        startDate,
        endDate,
      },
    ],
    queryFn: () =>
      AuditLogsService.readAuditLogs({
        skip,
        limit,
        keyword: keyword || undefined,
        module: selectedModule !== "ALL" ? selectedModule : undefined,
        action: selectedAction !== "ALL" ? selectedAction : undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      }),
  })

  const handleResetFilters = () => {
    setKeyword("")
    setSelectedModule("ALL")
    setSelectedAction("ALL")
    setStartDate("")
    setEndDate("")
    setPage(1)
  }

  const handleRowClick = (log: AuditLogPublic) => {
    setSelectedLog(log)
    setDrawerOpen(true)
  }

  const getActionBadgeColor = (action: string) => {
    switch (action.toUpperCase()) {
      case "CREATE":
        return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      case "UPDATE":
        return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
      case "DELETE":
        return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
      case "LOGIN":
      case "LOGOUT":
        return "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
      case "IMPORT":
      case "EXPORT":
        return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
      case "STATUS_CHANGE":
        return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30"
      case "AI_REQUEST":
      case "GENERATE":
        return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
      default:
        return "bg-secondary text-secondary-foreground"
    }
  }

  const totalCount = data?.count || 0
  const totalPages = Math.ceil(totalCount / limit) || 1

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <Card className="border-border/60 shadow-xs py-0 gap-0">
        <CardHeader className="pt-2.5 pb-2 sm:pt-4 sm:pb-3 px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              Filter & Search Logs
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 text-xs gap-1.5"
              >
                <FileX className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-3 sm:pb-4 pt-1 sm:pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Keyword search..."
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value)
                  setPage(1)
                }}
                className="pl-8 text-xs h-9"
              />
            </div>

            {/* Module & Action Selectors (side-by-side & full-width on mobile) */}
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <Select
                value={selectedModule}
                onValueChange={(val) => {
                  setSelectedModule(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs w-full">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Modules</SelectItem>
                  {MODULE_OPTIONS.map((mod) => (
                    <SelectItem key={mod} value={mod}>
                      {mod}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedAction}
                onValueChange={(val) => {
                  setSelectedAction(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 text-xs w-full">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Actions</SelectItem>
                  {ACTION_OPTIONS.map((act) => (
                    <SelectItem key={act} value={act}>
                      {act}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start & End Date Inputs (side-by-side on mobile) */}
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <DateInput
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPage(1)
                }}
                placeholder="Start Date"
                className="text-xs h-9"
              />

              <DateInput
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPage(1)
                }}
                placeholder="End Date"
                className="text-xs h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table View */}
      <div className="flex flex-col gap-4 overflow-x-auto">
        <Table className="min-w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[180px] text-xs font-semibold">
                Timestamp
              </TableHead>
              <TableHead className="w-[180px] text-xs font-semibold">
                User
              </TableHead>
              <TableHead className="w-[150px] text-xs font-semibold">
                Company
              </TableHead>
              <TableHead className="w-[140px] text-xs font-semibold">
                Module
              </TableHead>
              <TableHead className="w-[110px] text-xs font-semibold">
                Action
              </TableHead>
              <TableHead className="w-[180px] text-xs font-semibold">
                Entity
              </TableHead>
              <TableHead className="text-xs font-semibold">
                Description
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground text-sm"
                >
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                  Loading audit trail logs...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-destructive text-sm"
                >
                  <ShieldAlert className="h-6 w-6 mx-auto mb-2" />
                  Failed to load audit logs. Verify superuser privileges.
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-32 text-center text-muted-foreground text-sm italic"
                >
                  No audit log records match the current criteria.
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((log) => (
                <TableRow
                  key={log.id}
                  onClick={() => handleRowClick(log)}
                  className="cursor-pointer hover:bg-muted/60 transition-colors text-xs"
                >
                  <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                    {formatDateTimeDMY(log.created_at)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground truncate max-w-[170px]">
                    {log.user_email || log.user_full_name || "System"}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[140px]">
                    {log.company_name || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="font-normal text-[11px]"
                    >
                      {log.module}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-2 py-0.5 ${getActionBadgeColor(log.action)}`}
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-foreground truncate max-w-[170px]">
                    {log.entity_name || "-"}
                  </TableCell>
                  <TableCell className="text-foreground max-w-[300px] truncate font-medium">
                    {log.description}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 py-3 sm:px-6 border-t bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {totalCount > 0 ? skip + 1 : 0}
              </span>{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {Math.min(skip + limit, totalCount)}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">{totalCount}</span>{" "}
              entries
            </div>

            <div className="flex items-center gap-x-2">
              <span className="text-sm text-muted-foreground">
                Rows per page
              </span>
              <Select
                value={String(limit)}
                onValueChange={(val) => {
                  setLimit(Number(val))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-17.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-x-6">
            <div className="flex items-center gap-x-1 text-sm text-muted-foreground">
              <span>Page</span>
              <span className="font-medium text-foreground">{page}</span>
              <span>of</span>
              <span className="font-medium text-foreground">{totalPages}</span>
            </div>

            <div className="flex items-center gap-x-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(1)}
                disabled={page === 1 || isLoading}
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages || isLoading}
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Details Side Panel Drawer */}
      <AuditLogDetailDrawer
        log={selectedLog}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  )
}
