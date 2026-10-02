import { createFileRoute, redirect } from "@tanstack/react-router"
import { ShieldCheck } from "lucide-react-motion"
import { UsersService } from "@/client"
import { AuditLogsTable } from "@/components/AuditLogs/AuditLogsTable"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/_layout/audit-logs")({
  component: AuditLogsPage,
  beforeLoad: async () => {
    const user = await UsersService.readUserMe()
    if (!user.is_superuser) {
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [{ title: `Audit Logs - ${APP_NAME}` }],
  }),
})

function AuditLogsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="font-bold text-2xl tracking-tight">Audit Logs</h1>
        </div>
        <p className="text-muted-foreground">
          Complete system audit trail of business events and user actions
        </p>
      </div>

      <AuditLogsTable />
    </div>
  )
}

export default AuditLogsPage
