import { useState } from "react"
import type { AuditLogPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AuditLogDetailDrawerProps {
  log: AuditLogPublic | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuditLogDetailDrawer({
  log,
  open,
  onOpenChange,
}: AuditLogDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"diff" | "old" | "new" | "meta">(
    "diff",
  )

  if (!log) return null

  // Extract changed fields between old_data and new_data
  const getChangedFields = () => {
    const oldObj = (log.old_data as Record<string, unknown>) || {}
    const newObj = (log.new_data as Record<string, unknown>) || {}

    const allKeys = Array.from(
      new Set([...Object.keys(oldObj), ...Object.keys(newObj)]),
    )
    const changed: Array<{ key: string; oldVal: unknown; newVal: unknown }> = []

    for (const key of allKeys) {
      const oldVal = oldObj[key]
      const newVal = newObj[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changed.push({ key, oldVal, newVal })
      }
    }
    return changed
  }

  const changedFields = getChangedFields()

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

  const renderJson = (data: unknown) => {
    if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
      return (
        <div className="p-4 text-center text-muted-foreground text-sm italic">
          No data available
        </div>
      )
    }
    return (
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-slate-100 text-xs leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto p-6"
      >
        <SheetHeader className="p-0 pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className={getActionBadgeColor(log.action)}
            >
              {log.action}
            </Badge>
            <span className="text-muted-foreground text-xs font-mono">
              ID: #{log.id}
            </span>
          </div>
          <SheetTitle className="text-lg font-bold mt-2">
            {log.description}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Recorded at{" "}
            {new Date(log.created_at || Date.now()).toLocaleString()}
          </SheetDescription>
        </SheetHeader>

        {/* Metadata Details Grid */}
        <div className="py-4 space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Log Context
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3.5 rounded-lg border border-border/50">
            <div>
              <span className="text-muted-foreground block font-medium">
                User
              </span>
              <span className="font-semibold text-foreground truncate block">
                {log.user_email || log.user_full_name || "System"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">
                Company
              </span>
              <span className="font-semibold text-foreground truncate block">
                {log.company_name || "-"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">
                Module
              </span>
              <Badge variant="secondary" className="mt-0.5 text-[10px]">
                {log.module}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">
                Table / Record ID
              </span>
              <span className="font-mono text-foreground font-medium block truncate">
                {log.table_name} {log.record_id ? `(#${log.record_id})` : ""}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">
                IP Address
              </span>
              <span className="font-mono text-foreground block">
                {log.ip_address || "N/A"}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground block font-medium">
                User Agent
              </span>
              <span
                className="font-mono text-[11px] text-muted-foreground block truncate"
                title={log.user_agent || "N/A"}
              >
                {log.user_agent || "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Data Inspection Tabs */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data Snapshots
          </h4>
          <Tabs
            value={activeTab}
            onValueChange={(val) =>
              setActiveTab(val as "diff" | "old" | "new" | "meta")
            }
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="diff" className="text-xs">
                Changes ({changedFields.length})
              </TabsTrigger>
              <TabsTrigger value="old" className="text-xs">
                Old Data
              </TabsTrigger>
              <TabsTrigger value="new" className="text-xs">
                New Data
              </TabsTrigger>
              <TabsTrigger value="meta" className="text-xs">
                Metadata
              </TabsTrigger>
            </TabsList>

            <TabsContent value="diff" className="mt-3">
              {changedFields.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-xs italic bg-muted/20 rounded-lg border border-dashed">
                  No individual field changes detected between snapshots.
                </div>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {changedFields.map(({ key, oldVal, newVal }) => (
                    <div
                      key={key}
                      className="p-3 rounded-lg border border-border/60 bg-card text-xs space-y-1.5"
                    >
                      <span className="font-mono font-semibold text-primary block">
                        {key}
                      </span>
                      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                        <div className="bg-red-500/10 dark:bg-red-950/40 p-2 rounded border border-red-500/20 text-red-700 dark:text-red-300 overflow-x-auto">
                          <span className="text-[9px] uppercase font-bold text-red-500 block mb-0.5">
                            Before
                          </span>
                          {JSON.stringify(oldVal)}
                        </div>
                        <div className="bg-emerald-500/10 dark:bg-emerald-950/40 p-2 rounded border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 overflow-x-auto">
                          <span className="text-[9px] uppercase font-bold text-emerald-500 block mb-0.5">
                            After
                          </span>
                          {JSON.stringify(newVal)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="old" className="mt-3">
              {renderJson(log.old_data)}
            </TabsContent>

            <TabsContent value="new" className="mt-3">
              {renderJson(log.new_data)}
            </TabsContent>

            <TabsContent value="meta" className="mt-3">
              {renderJson(log.log_metadata)}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
