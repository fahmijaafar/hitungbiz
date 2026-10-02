import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowRight,
  FileUp,
  RefreshCcw,
  Upload,
} from "lucide-react-motion"
import { useEffect, useMemo, useState } from "react"
import { z } from "zod"
import { TransactionImportsService } from "@/client"
import { CSVHeaderMapper } from "@/components/Imports/CSVHeaderMapper"
import { CSVUploader } from "@/components/Imports/CSVUploader"
import { ImportPreviewTable } from "@/components/Imports/ImportPreviewTable"
import {
  ImportProgressDialog,
  type ImportResult,
} from "@/components/Imports/ImportProgressDialog"
import { ValidationSummary } from "@/components/Imports/ValidationSummary"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import useCustomToast from "@/hooks/useCustomToast"
import { APP_NAME } from "@/lib/app"
import {
  buildDraftRecords,
  type CsvParseResult,
  type DraftRecord,
  detectMapping,
  type ImportField,
  type ImportStep,
  type ImportType,
  toCsvValue,
} from "@/lib/csvImport"
import { cn } from "@/lib/utils"
import { handleError } from "@/utils"

const IMPORT_STEPS: Array<{
  key: ImportStep
  label: string
  description: string
}> = [
  {
    key: "upload",
    label: "Upload",
    description: "Upload your CSV file",
  },
  {
    key: "mapping",
    label: "Column Mapping",
    description: "Map columns to your fields",
  },
  {
    key: "validation",
    label: "Validation",
    description: "Check data for errors",
  },
  {
    key: "review",
    label: "Review",
    description: "Review your data",
  },
  {
    key: "import",
    label: "Import",
    description: "Import data to your account",
  },
]

function ImportStepper({ step }: { step: ImportStep }) {
  const currentIndex = Math.max(
    0,
    IMPORT_STEPS.findIndex((item) => item.key === step),
  )

  return (
    <div className="overflow-x-auto rounded-md border bg-background px-4 py-5">
      <div className="grid min-w-215 grid-cols-[1fr_96px_1fr_96px_1fr_96px_1fr_96px_1fr] items-start">
        {IMPORT_STEPS.map((item, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const isActive = isCompleted || isCurrent
          const connectorComplete = index < currentIndex

          return (
            <div
              key={item.key}
              className={cn(
                "contents",
                index === IMPORT_STEPS.length - 1 && "last-step",
              )}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full border-2 text-base font-semibold transition-colors",
                    isCompleted &&
                      "border-blue-600 bg-blue-600 text-white shadow-sm",
                    isCurrent && "border-blue-600 bg-background text-blue-600",
                    !isActive &&
                      "border-slate-300 bg-background text-slate-500",
                  )}
                >
                  {index + 1}
                </div>
                <div
                  className={cn(
                    "mt-3 text-sm font-semibold",
                    isActive ? "text-blue-600" : "text-slate-700",
                  )}
                >
                  {item.label}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {item.description}
                </div>
              </div>
              {index < IMPORT_STEPS.length - 1 ? (
                <div className="flex h-11 items-center px-3">
                  <div
                    className={cn(
                      "h-0.5 flex-1",
                      connectorComplete ? "bg-blue-600" : "bg-slate-300",
                    )}
                  />
                  <ArrowRight
                    className={cn(
                      "-ml-1 size-5",
                      connectorComplete ? "text-blue-600" : "text-slate-400",
                    )}
                    strokeWidth={1.8}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const importSearchSchema = z.object({
  type: z.enum(["revenue", "expenses", "clients", "products"]).optional(),
})

export const Route = createFileRoute("/_layout/import-transactions")({
  validateSearch: (search: Record<string, unknown>) =>
    importSearchSchema.parse(search),
  component: TransactionImportPage,
  head: () => ({
    meta: [
      {
        title: `Import Data - ${APP_NAME}`,
      },
    ],
  }),
})

function TransactionImportPage() {
  const searchParams = Route.useSearch()
  const companyId = useCurrentCompanyId()
  const [importType, setImportType] = useState<ImportType>(
    searchParams.type ?? "revenue",
  )
  const [step, setStep] = useState<ImportStep>("upload")
  const [fileName, setFileName] = useState("")
  const [csv, setCsv] = useState<CsvParseResult | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<DraftRecord[]>([])
  const [result, setResult] = useState<ImportResult | undefined>(undefined)
  const [progressOpen, setProgressOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const fieldsQuery = useQuery({
    queryKey: ["transaction-import-fields", importType],
    queryFn: async () =>
      TransactionImportsService.readImportFields({ importType }),
  })
  const fields = (fieldsQuery.data?.fields ?? []) as ImportField[]

  useEffect(() => {
    if (step === "mapping" && csv && fields.length > 0) {
      setMapping((current) =>
        Object.values(current).some(Boolean)
          ? current
          : detectMapping(csv.headers, fields),
      )
    }
  }, [csv, fields, step])

  const summary = useMemo(() => {
    const validRows = drafts.filter(
      (record) => record.status === "valid",
    ).length
    const invalidRows = drafts.filter(
      (record) => record.status === "invalid",
    ).length
    const selectedRows = drafts.filter(
      (record) => record.selected && record.status === "valid",
    ).length
    return {
      totalRows: drafts.length,
      validRows,
      invalidRows,
      selectedRows,
    }
  }, [drafts])

  const validateMutation = useMutation({
    mutationFn: async (records: DraftRecord[]) =>
      TransactionImportsService.validateImportRecords({
        requestBody: {
          import_type: importType,
          company_id: companyId,
          records,
        },
      }),
    onSuccess: (response) => {
      setDrafts(
        response.records.map((record) => ({
          row_number: record.row_number,
          selected: record.selected ?? true,
          status: record.status as DraftRecord["status"],
          errors: record.errors ?? [],
          original_row: record.original_row as Record<string, string>,
          data: record.data as Record<string, unknown>,
        })),
      )
      setStep("review")
    },
    onError: handleError.bind(showErrorToast),
  })

  const importMutation = useMutation({
    mutationFn: async (records: DraftRecord[]) =>
      TransactionImportsService.bulkInsertImportRecords({
        requestBody: {
          import_type: importType,
          company_id: companyId,
          batch_size: 100,
          records,
        },
      }),
    onMutate: () => {
      setProgressOpen(true)
      setResult(undefined)
    },
    onSuccess: (response) => {
      setResult(response as ImportResult)
      showSuccessToast(`Imported ${response.imported} records`)
      queryClient.invalidateQueries({ queryKey: ["sales"] })
      queryClient.invalidateQueries({ queryKey: ["purchases"] })
      queryClient.invalidateQueries({ queryKey: ["clients"] })
      queryClient.invalidateQueries({ queryKey: ["clients-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["products-infinite"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const handleParsed = (name: string, result: CsvParseResult) => {
    setFileName(name)
    setCsv(result)
    setDrafts([])
    setResult(undefined)
    setMapping(detectMapping(result.headers, fields))
    setStep("mapping")
  }

  const parseDrafts = () => {
    if (!csv) {
      return
    }
    const records = buildDraftRecords(csv.rows, mapping)
    setDrafts(records)
    setStep("validation")
    validateMutation.mutate(records)
  }

  const downloadErrors = () => {
    const failedRows = result?.results.filter(
      (item) => item.status === "failed",
    )
    if (!failedRows?.length) {
      return
    }
    const sourceRows = new Map(
      drafts.map((record) => [record.row_number, record]),
    )
    const lines = [
      ["row_number", "status", "errors", ...(csv?.headers ?? [])]
        .map(toCsvValue)
        .join(","),
      ...failedRows.map((row) => {
        const source = sourceRows.get(row.row_number)
        return [
          row.row_number,
          row.status,
          row.errors.join("; "),
          ...(csv?.headers ?? []).map(
            (header) => source?.original_row[header] ?? "",
          ),
        ]
          .map(toCsvValue)
          .join(",")
      }),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "transaction-import-errors.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setStep("upload")
    setCsv(null)
    setFileName("")
    setMapping({})
    setDrafts([])
    setResult(undefined)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Upload className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Import</h1>
          </div>
          <p className="text-muted-foreground">
            Bulk import your transactions, products and clients from other
            systems.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {step !== "upload" ? (
            <Button type="button" variant="outline" onClick={reset}>
              <RefreshCcw className="mr-2 size-4" />
              Start over
            </Button>
          ) : null}
        </div>
      </div>

      <ImportStepper step={step} />

      {fieldsQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Import fields could not be loaded</AlertTitle>
          <AlertDescription>
            Refresh the page and try again before uploading a CSV.
          </AlertDescription>
        </Alert>
      ) : null}

      {step === "upload" ? (
        <CSVUploader
          importType={importType}
          fields={fields}
          onImportTypeChange={(value) => {
            setImportType(value)
            setMapping({})
          }}
          onParsed={handleParsed}
        />
      ) : null}

      {step === "mapping" && csv ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileUp className="size-4" />
            <span>
              {fileName} · {csv.rows.length} rows · delimiter{" "}
              {csv.delimiter === "\t" ? "tab" : csv.delimiter}
            </span>
          </div>
          <CSVHeaderMapper
            headers={csv.headers}
            rows={csv.rows}
            fields={fields}
            mapping={mapping}
            onMappingChange={setMapping}
            onContinue={parseDrafts}
          />
        </div>
      ) : null}

      {step === "validation" ? (
        <Alert>
          <AlertTitle>Validating draft records</AlertTitle>
          <AlertDescription>
            Parsed rows are still only in browser state. Nothing has been
            inserted yet.
          </AlertDescription>
        </Alert>
      ) : null}

      {step === "review" ? (
        <div className="space-y-4">
          <ValidationSummary {...summary} />
          <ImportPreviewTable
            importType={importType}
            records={drafts}
            onRecordsChange={setDrafts}
          />
          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("mapping")}
            >
              <ArrowLeft className="mr-2 size-4" />
              Back to mapping
            </Button>
            <Button
              type="button"
              disabled={summary.selectedRows === 0 || importMutation.isPending}
              onClick={() => {
                setStep("import")
                importMutation.mutate(drafts)
              }}
            >
              Import {summary.selectedRows} rows
            </Button>
          </div>
        </div>
      ) : null}

      <ImportProgressDialog
        open={progressOpen}
        isImporting={importMutation.isPending}
        result={result}
        onOpenChange={setProgressOpen}
        onDownloadErrors={downloadErrors}
      />
    </div>
  )
}

export default TransactionImportPage
