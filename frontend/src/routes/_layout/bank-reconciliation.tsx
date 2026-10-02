import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  TriangleAlert as AlertTriangle,
  Check,
  Eye,
  FileSpreadsheet,
  ListFilter as Filter,
  Landmark,
  Search,
  Upload,
  X,
} from "lucide-react-motion"
import * as pdfjs from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"
import { Fragment, useMemo, useRef, useState } from "react"
import Tesseract from "tesseract.js"
import {
  ApiError,
  type BankImportSessionsPublic,
  type BankImportTransactionPublic,
  type BankReconciliationBulkUpdate,
  BankReconciliationService,
  type BankReconciliationSessionDetail,
  type BankReconciliationTransactionUpdate,
  SalesService,
} from "@/client"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Textarea } from "@/components/ui/textarea"
import PURCHASE_CATEGORIES from "@/constants/purchaseCategories"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"
import { formatCurrency } from "@/lib/currency"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { cn } from "@/lib/utils"

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const Route = createFileRoute("/_layout/bank-reconciliation")({
  component: BankReconciliationPage,
  head: () => ({
    meta: [{ title: `Bank Reconciliation - ${APP_NAME}` }],
  }),
})

const STATUSES = [
  "Matched",
  "Suggested Expense",
  "Suggested Revenue",
  "Needs Review",
  "Duplicate",
  "Ignored",
  "Applied",
]

const ACTIONS = [
  "Create Expense",
  "Create Revenue",
  "Match Existing",
  "Ignore",
  "Review",
]

const EXPENSE_CATEGORIES = PURCHASE_CATEGORIES.flatMap((group) => group.items)

const DEFAULT_REVENUE_CHANNELS = [
  "Sales Income",
  "Interest Income",
  "Bank Transfer",
  "Owner Withdrawal",
  "Capital Injection",
  "Uncategorised",
]

async function fetchSessions(
  companyId: string | null,
): Promise<BankImportSessionsPublic> {
  return BankReconciliationService.readBankImportSessions({
    companyId: companyId,
  })
}

async function fetchSession(
  id: string,
): Promise<BankReconciliationSessionDetail> {
  return BankReconciliationService.readBankImportSession({
    sessionId: id,
  })
}

async function fetchSalesChannels(companyId: string | null) {
  return SalesService.readSalesChannels({
    companyId: companyId,
  })
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error("Could not render PDF page for OCR."))
      }
    }, "image/png")
  })
}

async function extractPdfOcrText(
  file: File,
  onProgress: (message: string) => void,
): Promise<string> {
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`Scanning PDF page ${pageNumber} of ${pdf.numPages}...`)
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Could not prepare PDF page for OCR.")
    }
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    const image = await canvasToBlob(canvas)
    const { data: ocr } = await Tesseract.recognize(image, "eng")
    if (ocr.text?.trim()) {
      pageTexts.push(ocr.text)
    }
    canvas.width = 0
    canvas.height = 0
  }

  return pageTexts.join("\n\n")
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | undefined)?.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string } | string
      return typeof first === "string" ? first : first.msg || error.message
    }
    return error.message
  }
  return "Upload failed."
}

function statusClass(status: string) {
  switch (status) {
    case "Matched":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "Suggested Expense":
      return "border-amber-200 bg-amber-50 text-amber-800"
    case "Suggested Revenue":
      return "border-sky-200 bg-sky-50 text-sky-800"
    case "Needs Review":
      return "border-rose-200 bg-rose-50 text-rose-700"
    case "Duplicate":
      return "border-slate-300 bg-slate-100 text-slate-700"
    case "Applied":
      return "border-indigo-200 bg-indigo-50 text-indigo-700"
    default:
      return "border-muted bg-muted text-muted-foreground"
  }
}

function confidenceClass(value: number) {
  if (value >= 95) return "text-emerald-700"
  if (value >= 80) return "text-amber-700"
  return "text-rose-700"
}

function isIgnored(transaction: BankImportTransactionPublic) {
  return (
    transaction.reconciliation_status === "Ignored" ||
    transaction.final_action === "Ignore"
  )
}

function canSelectTransaction(transaction: BankImportTransactionPublic) {
  return !transaction.applied_at && !isIgnored(transaction)
}

function categoryTypeFor(transaction: BankImportTransactionPublic) {
  const finalAction = transaction.final_action?.toLowerCase() ?? ""
  if (finalAction.includes("expense") || finalAction.includes("purchase")) {
    return "expense"
  }
  if (
    finalAction.includes("revenue") ||
    finalAction.includes("sale") ||
    finalAction.includes("income")
  ) {
    return "revenue"
  }

  const typeText = [
    transaction.ai_transaction_type,
    transaction.ai_suggested_action,
    transaction.reconciliation_status,
    transaction.matched_record_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (typeText.includes("expense") || typeText.includes("purchase")) {
    return "expense"
  }
  if (
    typeText.includes("revenue") ||
    typeText.includes("sale") ||
    typeText.includes("income")
  ) {
    return "revenue"
  }

  const debit = transaction.debit ?? 0
  const credit = transaction.credit ?? 0
  if (debit > 0 && debit >= credit) return "expense"
  if (credit > 0 && credit >= debit) return "revenue"
  if (transaction.amount < 0) return "expense"
  return "revenue"
}

function isExpenseCategoryRow(transaction: BankImportTransactionPublic) {
  return categoryTypeFor(transaction) === "expense"
}

function categoryOptionsFor(
  transaction: BankImportTransactionPublic,
  revenueChannels: string[],
) {
  return isExpenseCategoryRow(transaction)
    ? EXPENSE_CATEGORIES
    : revenueChannels
}

function categoryValueFor(transaction: BankImportTransactionPublic) {
  const candidate =
    transaction.final_category || transaction.ai_category || "Uncategorised"
  if (!isExpenseCategoryRow(transaction)) {
    return candidate
  }
  return EXPENSE_CATEGORIES.includes(candidate)
    ? candidate
    : "Miscellaneous Business Expense"
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <div className="rounded-md border bg-background px-4 py-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", tone)}>{value}</div>
    </div>
  )
}

function CategoryEditor({
  transaction,
  revenueChannels,
  onChange,
  className,
}: {
  transaction: BankImportTransactionPublic
  revenueChannels: string[]
  onChange: (value: string) => void
  className?: string
}) {
  const options = categoryOptionsFor(transaction, revenueChannels)
  const category = categoryValueFor(transaction)
  const value = options.includes(category)
    ? category
    : options.includes("Uncategorised")
      ? "Uncategorised"
      : options[0]

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-48", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((category) => (
          <SelectItem key={category} value={category}>
            {category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function BankReconciliationPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [activeSessionId, setActiveSessionId] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [expandedId, setExpandedId] = useState<string>("")
  const [uploadError, setUploadError] = useState("")
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([])
  const [processingMessage, setProcessingMessage] = useState("")
  const [upgradeModalState, setUpgradeModalState] = useState({
    open: false,
    feature: "ocr",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 10,
    limitType: undefined as string | undefined,
    retryAt: null as string | null,
    recommendedPlan: "pro" as string | null,
  })
  const companyId = useCurrentCompanyId()

  const sessionsQuery = useQuery({
    queryKey: ["bank-reconciliation-sessions", companyId],
    queryFn: () => fetchSessions(companyId),
  })

  const sessions = sessionsQuery.data?.data ?? []
  const selectedSessionId = activeSessionId || sessions[0]?.id || ""

  const detailQuery = useQuery({
    queryKey: ["bank-reconciliation-session", selectedSessionId, companyId],
    queryFn: () => fetchSession(selectedSessionId),
    enabled: !!selectedSessionId,
  })

  const salesChannelsQuery = useQuery({
    queryKey: ["sales-channels", companyId],
    queryFn: () => fetchSalesChannels(companyId),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const isPdf = file.name.toLowerCase().endsWith(".pdf")
      const ocrText = isPdf
        ? await extractPdfOcrText(file, setProcessingMessage)
        : undefined
      setProcessingMessage(
        isPdf
          ? "Parsing OCR text with AI..."
          : "Parsing bank statement transactions...",
      )
      return BankReconciliationService.uploadBankStatement({
        companyId: localStorage.getItem("company_id"),
        formData: { file, ocr_text: ocrText || undefined },
      })
    },
    onSuccess: (data) => {
      setUploadError("")
      setUploadWarnings(data.warnings ?? [])
      setActiveSessionId(data.session.id)
      queryClient.invalidateQueries({
        queryKey: ["bank-reconciliation-sessions"],
      })
      queryClient.setQueryData(
        ["bank-reconciliation-session", data.session.id],
        data,
      )
    },
    onError: (error: any) => {
      const errDetail = error?.body?.detail
      if (
        errDetail &&
        typeof errDetail === "object" &&
        errDetail.error === "LIMIT_REACHED"
      ) {
        setUploadError("")
        setUpgradeModalState({
          open: true,
          feature: errDetail.feature || "ocr",
          currentPlan: errDetail.plan || "personal",
          currentUsage: errDetail.current_usage ?? 0,
          limit: errDetail.limit ?? 10,
          limitType: errDetail.limit_type,
          retryAt: errDetail.retry_at ?? null,
          recommendedPlan:
            errDetail.next_plan ?? UPGRADE_PATH[errDetail.plan] ?? null,
        })
      } else {
        setUploadError(getErrorMessage(error))
      }
    },
    onSettled: () => {
      setProcessingMessage("")
    },
  })

  const updateTransaction = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string
      payload: BankReconciliationTransactionUpdate
    }) => {
      return BankReconciliationService.updateBankTransaction({
        transactionId: id,
        requestBody: payload,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bank-reconciliation-session", selectedSessionId],
      })
    },
  })

  const bulkUpdate = useMutation({
    mutationFn: (payload: BankReconciliationBulkUpdate) =>
      BankReconciliationService.bulkUpdateBankTransactions({
        sessionId: selectedSessionId,
        requestBody: payload,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["bank-reconciliation-session", selectedSessionId],
        data,
      )
    },
  })

  const applyMutation = useMutation({
    mutationFn: async () => {
      const selectedIds =
        detailQuery.data?.transactions
          .filter(
            (transaction) =>
              transaction.selected && canSelectTransaction(transaction),
          )
          .map((transaction) => transaction.id) ?? []
      return BankReconciliationService.applyBankReconciliation({
        sessionId: selectedSessionId,
        requestBody: { transaction_ids: selectedIds },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bank-reconciliation-session", selectedSessionId],
      })
      queryClient.invalidateQueries({
        queryKey: ["bank-reconciliation-sessions"],
      })
      queryClient.invalidateQueries({
        queryKey: ["sales-channels", localStorage.getItem("company_id")],
      })
    },
  })

  const transactions = detailQuery.data?.transactions ?? []
  const filtered = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesStatus =
        statusFilter === "all" ||
        transaction.reconciliation_status === statusFilter
      const searchText =
        `${transaction.description} ${transaction.reference || ""} ${transaction.ai_category || ""}`.toLowerCase()
      return matchesStatus && searchText.includes(query.toLowerCase())
    })
  }, [query, statusFilter, transactions])

  const selectableFiltered = filtered.filter(canSelectTransaction)
  const selectedIds = filtered
    .filter(
      (transaction) =>
        transaction.selected && canSelectTransaction(transaction),
    )
    .map((transaction) => transaction.id)
  const allVisibleSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((transaction) => transaction.selected)
  const someVisibleSelected =
    selectableFiltered.some((transaction) => transaction.selected) &&
    !allVisibleSelected

  const detail = detailQuery.data
  const summary = detail?.summary
  const availableRevenueChannels = useMemo(
    () =>
      Array.from(
        new Set([
          ...(salesChannelsQuery.data?.data ?? []),
          ...DEFAULT_REVENUE_CHANNELS,
        ]),
      ),
    [salesChannelsQuery.data?.data],
  )

  const handleFile = (file?: File) => {
    if (!file) return
    const allowed = [".csv", ".xlsx", ".pdf"]
    if (
      !allowed.some((extension) => file.name.toLowerCase().endsWith(extension))
    ) {
      setUploadError("Upload a PDF, CSV, or XLSX bank statement.")
      return
    }
    setUploadWarnings([])
    uploadMutation.mutate(file)
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                Bank Reconciliation
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Stage statement transactions, review AI suggestions, then apply
              approved changes.
            </p>
          </div>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload className="size-4" />
            {uploadMutation.isPending
              ? processingMessage || "Processing..."
              : "Upload Statement"}
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="space-y-4">
            <button
              type="button"
              className="flex min-h-44 w-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-5 text-center transition-colors hover:bg-muted/40"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="mb-3 size-8 text-muted-foreground" />
              <span className="font-medium">Upload PDF, CSV, or XLSX</span>
              <span className="mt-1 text-sm text-muted-foreground">
                {uploadMutation.isPending
                  ? processingMessage || "Processing statement..."
                  : "Transactions are saved to a reconciliation session first."}
              </span>
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </button>

            {uploadError ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="rounded-md border">
              <div className="border-b px-4 py-3 text-sm font-semibold">
                Sessions
              </div>
              <div className="max-h-96 overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">
                    No reconciliation sessions yet.
                  </div>
                ) : (
                  sessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={cn(
                        "block w-full border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-muted/50",
                        selectedSessionId === session.id && "bg-muted",
                      )}
                      onClick={() => setActiveSessionId(session.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">
                          {session.bank_name ||
                            session.file_name ||
                            "Bank statement"}
                        </span>
                        <Badge variant="outline">{session.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {session.transaction_count} transactions
                        {session.statement_start && session.statement_end
                          ? `, ${session.statement_start} to ${session.statement_end}`
                          : ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            {uploadWarnings.map((warning) => (
              <Alert key={warning}>
                <AlertTriangle className="size-4" />
                <AlertTitle>Review recommended</AlertTitle>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile
                label="Matched"
                value={summary?.matched ?? 0}
                tone="text-emerald-700"
              />
              <StatTile
                label="Needs Review"
                value={summary?.needs_review ?? 0}
                tone="text-rose-700"
              />
              <StatTile
                label="Suggested Expenses"
                value={summary?.suggested_expenses ?? 0}
                tone="text-amber-700"
              />
              <StatTile
                label="Suggested Revenues"
                value={summary?.suggested_revenues ?? 0}
                tone="text-sky-700"
              />
              <StatTile
                label="Duplicates"
                value={summary?.duplicates ?? 0}
                tone="text-slate-700"
              />
              <StatTile
                label="Ignored"
                value={summary?.ignored ?? 0}
                tone="text-muted-foreground"
              />
            </div>

            <div className="rounded-md border">
              <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search description, reference, or category"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-56">
                      <Filter className="size-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      bulkUpdate.mutate({
                        transaction_ids: selectableFiltered.map(
                          (item) => item.id,
                        ),
                        selected: true,
                      })
                    }
                    disabled={
                      selectableFiltered.length === 0 || bulkUpdate.isPending
                    }
                  >
                    <Check className="size-4" />
                    Approve Visible
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      bulkUpdate.mutate({
                        transaction_ids: selectedIds,
                        selected: false,
                        final_action: "Ignore",
                        reconciliation_status: "Ignored",
                      })
                    }
                    disabled={selectedIds.length === 0 || bulkUpdate.isPending}
                  >
                    <X className="size-4" />
                    Ignore Selected
                  </Button>
                  <Button
                    onClick={() => applyMutation.mutate()}
                    disabled={
                      !selectedSessionId ||
                      selectedIds.length === 0 ||
                      applyMutation.isPending
                    }
                  >
                    Apply Changes
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-11">
                        <Checkbox
                          aria-label="Select all visible transactions"
                          checked={
                            allVisibleSelected
                              ? true
                              : someVisibleSelected
                                ? "indeterminate"
                                : false
                          }
                          disabled={
                            selectableFiltered.length === 0 ||
                            bulkUpdate.isPending
                          }
                          onCheckedChange={(checked) =>
                            bulkUpdate.mutate({
                              transaction_ids: selectableFiltered.map(
                                (item) => item.id,
                              ),
                              selected: checked === true,
                            })
                          }
                        />
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="min-w-64">Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Matched Record</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="w-11" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((transaction) => (
                      <Fragment key={transaction.id}>
                        <TableRow key={transaction.id}>
                          <TableCell>
                            <Checkbox
                              checked={
                                isIgnored(transaction)
                                  ? false
                                  : transaction.selected
                              }
                              disabled={!canSelectTransaction(transaction)}
                              onCheckedChange={(checked) =>
                                updateTransaction.mutate({
                                  id: transaction.id,
                                  payload: { selected: checked === true },
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusClass(
                                transaction.reconciliation_status ??
                                  "Needs Review",
                              )}
                            >
                              {transaction.reconciliation_status ??
                                "Needs Review"}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {transaction.date}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {transaction.description}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {transaction.reference || "No reference"}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-medium">
                            {formatCurrency(transaction.amount)}
                          </TableCell>
                          <TableCell>
                            <CategoryEditor
                              transaction={transaction}
                              revenueChannels={availableRevenueChannels}
                              onChange={(value) =>
                                updateTransaction.mutate({
                                  id: transaction.id,
                                  payload: { final_category: value },
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "font-semibold",
                                confidenceClass(transaction.ai_confidence ?? 0),
                              )}
                            >
                              {transaction.ai_confidence ?? 0}%
                            </span>
                          </TableCell>
                          <TableCell>
                            {transaction.matched_record_id ? (
                              <div className="text-sm">
                                <div>{transaction.matched_record_type}</div>
                                <div className="text-xs text-muted-foreground">
                                  {transaction.match_confidence}% match
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                None
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={transaction.final_action}
                              onValueChange={(value) =>
                                updateTransaction.mutate({
                                  id: transaction.id,
                                  payload: {
                                    final_action: value,
                                    selected:
                                      value === "Ignore"
                                        ? false
                                        : transaction.selected,
                                    reconciliation_status:
                                      value === "Ignore"
                                        ? "Ignored"
                                        : transaction.reconciliation_status,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ACTIONS.map((action) => (
                                  <SelectItem key={action} value={action}>
                                    {action}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setExpandedId(
                                  expandedId === transaction.id
                                    ? ""
                                    : transaction.id,
                                )
                              }
                            >
                              <Eye className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expandedId === transaction.id ? (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30">
                              <div className="grid gap-3 lg:grid-cols-3">
                                <div>
                                  <Label>AI reasoning</Label>
                                  <Textarea
                                    readOnly
                                    value={transaction.ai_reason}
                                    className="mt-2 min-h-24"
                                  />
                                </div>
                                <div>
                                  <Label>Match reason</Label>
                                  <Textarea
                                    readOnly
                                    value={
                                      transaction.match_reason ||
                                      "No match found."
                                    }
                                    className="mt-2 min-h-24"
                                  />
                                </div>
                                <div>
                                  <Label>Final category</Label>
                                  <CategoryEditor
                                    transaction={transaction}
                                    revenueChannels={availableRevenueChannels}
                                    className="mt-2 w-full"
                                    onChange={(value) =>
                                      updateTransaction.mutate({
                                        id: transaction.id,
                                        payload: {
                                          final_category: value,
                                        },
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    ))}
                    {!detailQuery.isLoading && filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="h-28 text-center text-muted-foreground"
                        >
                          No transactions match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>
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
    </>
  )
}
