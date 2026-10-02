import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { CalendarClock, Plus, Search } from "lucide-react-motion"
import { useState } from "react"
import {
  type DocumentPublic,
  type RecurringDocCreate,
  type RecurringDocUpdate,
  RecurringService,
} from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import {
  InvoiceForm,
  type InvoiceFormPayload,
} from "@/components/Invoices/InvoiceForm"
import { RecurringScheduleActionsMenu } from "@/components/Recurring/RecurringScheduleActionsMenu"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import useCustomToast from "@/hooks/useCustomToast"
import useSubscription from "@/hooks/useSubscription"
import { APP_NAME } from "@/lib/app"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { formatDateDMY, getLocalDateString } from "@/lib/utils"

export interface RecurringTemplate {
  id?: string
  doctype: string
  client_id?: string | null
  date: string
  title: string
  item: Array<Record<string, unknown>> | Record<string, unknown>
  price_calculation: Record<string, unknown>
  remark: string
  status: string
  validity?: string | null
  duedate?: string | null
}

export interface RecurringSchedule {
  id: string
  name: string
  status: string
  frequency: string
  interval: number
  start_date: string
  end_date?: string | null
  next_run_date?: string | null
  generated_count: number
  due_after_days: number
  customer_name?: string | null
}

type RecurringDetail = {
  schedule: RecurringSchedule
  template: RecurringTemplate | null
}
type EditorMode = "create" | "edit" | "view"

const frequencyOptions = ["daily", "weekly", "monthly", "yearly"]

const fetchSchedules = async (cid?: string | null) => {
  const response = (await RecurringService.readRecurringConfigs({
    companyId: cid ?? undefined,
  })) as { data: RecurringSchedule[] }
  return response.data
}

const fetchDetail = async (id: string) => {
  return (await RecurringService.readRecurringConfig({
    id,
  })) as unknown as RecurringDetail
}

function formatDate(value?: string | null) {
  return formatDateDMY(value)
}

function toInvoice(template?: RecurringTemplate | null): DocumentPublic {
  return {
    id: template?.id ?? "recurring-template",
    docno: "TEMPLATE",
    doctype: "invoice",
    client_id: template?.client_id ?? null,
    date: template?.date ?? new Date().toISOString().slice(0, 10),
    title: template?.title ?? "",
    item: template?.item ?? [],
    price_calculation: template?.price_calculation ?? {},
    remark: template?.remark ?? "",
    status: template?.status ?? "Draft",
    validity: template?.validity ?? null,
    duedate: template?.duedate ?? null,
  }
}

function templateFromInvoice(payload: InvoiceFormPayload): RecurringTemplate {
  const invoice = payload as DocumentPublic
  return {
    doctype: "invoice",
    client_id: invoice.client_id ?? null,
    date: invoice.date ?? new Date().toISOString().slice(0, 10),
    title: invoice.title ?? "",
    item: invoice.item ?? [],
    price_calculation: invoice.price_calculation ?? {},
    remark: invoice.remark ?? "",
    status: invoice.status ?? "Draft",
    validity: invoice.validity ?? null,
    duedate: invoice.duedate ?? null,
  }
}

function getColumns(actions: {
  generate: (id: string) => void
  toggle: (id: string, action: "pause" | "resume") => void
  edit: (schedule: RecurringSchedule) => void
  view: (schedule: RecurringSchedule) => void
}): ColumnDef<RecurringSchedule>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Customer",
      cell: ({ row }) => row.original.customer_name || "—",
    },
    {
      id: "frequency",
      header: "Frequency",
      cell: ({ row }) =>
        `${row.original.frequency} · every ${row.original.interval}`,
    },
    {
      accessorKey: "next_run_date",
      header: "Next Run",
      cell: ({ row }) => formatDate(row.original.next_run_date),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span
          className={
            row.original.status === "Active"
              ? "text-green-600"
              : "text-rose-500"
          }
        >
          {row.original.status}
        </span>
      ),
    },
    { accessorKey: "generated_count", header: "Generated Count" },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RecurringScheduleActionsMenu
            schedule={row.original}
            onGenerate={actions.generate}
            onToggleStatus={actions.toggle}
            onEdit={actions.edit}
            onView={actions.view}
          />
        </div>
      ),
    },
  ]
}

function ScheduleFields({
  schedule,
  disabled,
  onChange,
}: {
  schedule: Partial<RecurringSchedule>
  disabled: boolean
  onChange: (field: string, value: string) => void
}) {
  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <h3 className="font-semibold">Recurring Schedule</h3>
        <p className="text-sm text-muted-foreground">
          When this invoice template should generate.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Schedule name</Label>
        <Input
          disabled={disabled}
          value={schedule.name ?? ""}
          onChange={(e) => onChange("name", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          disabled={disabled}
          value={schedule.status ?? "Active"}
          onValueChange={(value) => onChange("status", value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Paused">Paused</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Frequency</Label>
        <Select
          disabled={disabled}
          value={schedule.frequency ?? "monthly"}
          onValueChange={(value) => onChange("frequency", value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {frequencyOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Interval</Label>
        <Input
          disabled={disabled}
          min="1"
          type="number"
          value={schedule.interval ?? 1}
          onChange={(e) => onChange("interval", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Starts on</Label>
        <DateInput
          disabled={disabled}
          value={schedule.start_date ?? ""}
          onChange={(e) => onChange("start_date", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Ends on (optional)</Label>
        <DateInput
          disabled={disabled}
          value={schedule.end_date ?? ""}
          onChange={(e) => onChange("end_date", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Due after (days)</Label>
        <Input
          disabled={disabled}
          min="0"
          type="number"
          value={schedule.due_after_days ?? 0}
          onChange={(e) => onChange("due_after_days", e.target.value)}
        />
      </div>
    </div>
  )
}

function RecurringInvoicesPage() {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { subscription, isLoading: subscriptionLoading } = useSubscription()
  const [editorOpen, setEditorOpen] = useState(false)
  const [mode, setMode] = useState<EditorMode>("create")
  const [editing, setEditing] = useState<RecurringDetail | null>(null)
  const [schedule, setSchedule] = useState<Partial<RecurringSchedule>>({
    name: "",
    status: "Active",
    frequency: "monthly",
    interval: 1,
    start_date: new Date().toISOString().slice(0, 10),
    due_after_days: 0,
  })
  const companyId = useCurrentCompanyId()
  const [generateImmediately, setGenerateImmediately] = useState(false)
  const [upgradeModalState, setUpgradeModalState] = useState({
    open: false,
    feature: "recurring_invoices",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 0,
    limitType: "feature_access" as string | undefined,
    retryAt: null as string | null,
    recommendedPlan: "pro" as string | null,
  })

  const showRecurringUpgradeModal = (detail?: any) => {
    const plan = detail?.plan || subscription.plan || "personal"
    setUpgradeModalState({
      open: true,
      feature: detail?.feature || "recurring_invoices",
      currentPlan: plan,
      currentUsage: detail?.current_usage ?? 0,
      limit: detail?.limit ?? 0,
      limitType: detail?.limit_type ?? "feature_access",
      retryAt: detail?.retry_at ?? null,
      recommendedPlan: detail?.next_plan ?? UPGRADE_PATH[plan] ?? "pro",
    })
  }

  const schedulesQuery = useQuery({
    queryKey: ["recurring-schedules", companyId],
    queryFn: () => fetchSchedules(companyId),
    retry: 1,
    staleTime: 30_000,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["recurring-schedules"] })
  const saveMutation = useMutation({
    mutationFn: ({ template }: { template: RecurringTemplate }) => {
      const schedulePayload = {
        name: schedule.name ?? "",
        status: schedule.status ?? "Active",
        frequency: schedule.frequency ?? "monthly",
        interval: Number(schedule.interval || 1),
        start_date:
          schedule.start_date ?? new Date().toISOString().slice(0, 10),
        end_date: schedule.end_date || null,
        due_after_days: Number(schedule.due_after_days || 0),
      }
      const templatePayload: RecurringDocCreate = {
        doctype: template.doctype || "invoice",
        client_id: template.client_id ?? null,
        date: template.date || new Date().toISOString().slice(0, 10),
        title: template.title || "",
        item: template.item ?? [],
        price_calculation: template.price_calculation ?? {},
        remark: template.remark || "",
        status: template.status || "Draft",
        validity: template.validity ?? null,
        duedate: template.duedate ?? null,
      }
      return mode === "edit" && editing
        ? RecurringService.updateRecurring({
            id: editing.schedule.id,
            requestBody: {
              schedule: schedulePayload,
              template: templatePayload as RecurringDocUpdate,
            },
          })
        : RecurringService.createRecurring({
            requestBody: {
              schedule: schedulePayload,
              template: templatePayload,
              generate_immediately: generateImmediately,
            },
          })
    },
    onSuccess: () => {
      invalidate()
      setEditorOpen(false)
      showSuccessToast(
        mode === "create"
          ? "Recurring invoice created"
          : "Recurring invoice updated",
      )
    },
    onError: (error: any) => {
      const errDetail = error?.body?.detail
      if (
        mode === "create" &&
        errDetail &&
        typeof errDetail === "object" &&
        errDetail.error === "LIMIT_REACHED"
      ) {
        setEditorOpen(false)
        showRecurringUpgradeModal(errDetail)
      } else {
        showErrorToast(
          error instanceof Error
            ? error.message
            : "Unable to save recurring invoice",
        )
      }
    },
  })
  const generateMutation = useMutation({
    mutationFn: (id: string) => RecurringService.generateNow({ id }),
    onSuccess: () => {
      invalidate()
      showSuccessToast("Invoice generated")
    },
    onError: (error: Error) => showErrorToast(error.message),
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" }) =>
      action === "pause"
        ? RecurringService.pauseRecurring({ id })
        : RecurringService.resumeRecurring({ id }),
    onSuccess: () => {
      invalidate()
      showSuccessToast("Recurring invoice updated")
    },
    onError: (error: Error) => showErrorToast(error.message),
  })

  const openCreate = () => {
    if (subscriptionLoading) {
      return
    }
    if (subscription.plan === "personal") {
      showRecurringUpgradeModal()
      return
    }
    setMode("create")
    setEditing(null)
    setSchedule({
      name: "",
      status: "Active",
      frequency: "monthly",
      interval: 1,
      start_date: getLocalDateString(),
      due_after_days: 0,
    })
    setGenerateImmediately(false)
    setEditorOpen(true)
  }
  const openExisting = async (
    item: RecurringSchedule,
    nextMode: EditorMode,
  ) => {
    try {
      const detail = await fetchDetail(item.id)
      setEditing(detail)
      setSchedule(detail.schedule)
      setMode(nextMode)
      setGenerateImmediately(false)
      setEditorOpen(true)
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "Unable to load recurring invoice",
      )
    }
  }
  const columns = getColumns({
    generate: (id) => generateMutation.mutate(id),
    toggle: (id, action) => toggleMutation.mutate({ id, action }),
    edit: (item) => void openExisting(item, "edit"),
    view: (item) => void openExisting(item, "view"),
  })
  const updateField = (field: string, value: string) =>
    setSchedule((current) => ({
      ...current,
      [field]: ["interval", "due_after_days"].includes(field)
        ? Number(value)
        : value,
    }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-2xl tracking-tight">
              Recurring Invoices
            </h1>
          </div>
          <p className="text-muted-foreground">Manage recurring invoices</p>
        </div>
        <Button
          onClick={openCreate}
          disabled={subscriptionLoading}
          className="h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4"
          aria-label="Create Recurring Invoice"
          title="Create Recurring Invoice"
        >
          <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
          <span className="hidden sm:inline">Create Recurring Invoice</span>
        </Button>
      </div>
      {schedulesQuery.isPending ? (
        <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          Loading recurring schedules...
        </div>
      ) : schedulesQuery.isError ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium text-destructive">
            {schedulesQuery.error instanceof Error
              ? schedulesQuery.error.message
              : "Failed to load recurring schedules."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => schedulesQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : schedulesQuery.data?.length ? (
        <DataTable columns={columns} data={schedulesQuery.data} />
      ) : (
        <div className="flex flex-col items-center rounded-lg border border-dashed bg-card py-12 text-center">
          <Search className="mb-4 h-8 w-8 text-muted-foreground" />
          <h3 className="font-semibold text-lg">No recurring invoices yet</h3>
          <p className="mt-2 text-muted-foreground">
            Create an invoice template and choose when it should recur.
          </p>
        </div>
      )}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-full sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "create"
                ? "Create Recurring Invoice"
                : mode === "view"
                  ? "View Recurring Invoice"
                  : "Edit Recurring Invoice"}
            </DialogTitle>
            <DialogDescription>
              Create the invoice template first, then define its recurring
              schedule.
            </DialogDescription>
          </DialogHeader>
          <ScheduleFields
            schedule={schedule}
            disabled={mode === "view"}
            onChange={updateField}
          />
          {mode === "create" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={generateImmediately}
                onChange={(e) => setGenerateImmediately(e.target.checked)}
              />
              Generate immediately after saving
            </label>
          )}
          <div className="border-t pt-5">
            <h3 className="mb-4 font-semibold">Invoice Template</h3>
            <InvoiceForm
              invoice={toInvoice(editing?.template)}
              mode={
                mode === "view" ? "view" : mode === "edit" ? "edit" : "create"
              }
              isPending={saveMutation.isPending}
              onSubmit={
                mode === "view"
                  ? undefined
                  : (payload) =>
                      saveMutation.mutate({
                        template: templateFromInvoice(payload),
                      })
              }
            />
          </div>
        </DialogContent>
      </Dialog>
      <UpgradeModal
        open={upgradeModalState.open}
        onClose={() =>
          setUpgradeModalState((prev) => ({ ...prev, open: false }))
        }
        feature={upgradeModalState.feature}
        currentPlan={upgradeModalState.currentPlan}
        currentUsage={upgradeModalState.currentUsage}
        limit={upgradeModalState.limit}
        limitType={upgradeModalState.limitType}
        retryAt={upgradeModalState.retryAt}
        recommendedPlan={upgradeModalState.recommendedPlan}
      />
    </div>
  )
}

export const Route = createFileRoute("/_layout/recurring-invoices")({
  component: RecurringInvoicesPage,
  head: () => ({ meta: [{ title: `Recurring Invoices - ${APP_NAME}` }] }),
})

export default RecurringInvoicesPage
