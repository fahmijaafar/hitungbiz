import { Info, Upload } from "lucide-react-motion"
import { useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  type CsvParseResult,
  type ImportField,
  type ImportType,
  parseCsvFile,
} from "@/lib/csvImport"

type CSVUploaderProps = {
  importType: ImportType
  fields?: ImportField[]
  onImportTypeChange: (value: ImportType) => void
  onParsed: (fileName: string, result: CsvParseResult) => void
}

const REQUIRED_FIELDS_MAP: Record<ImportType, string[]> = {
  revenue: ["Date", "Channel", "Gross Amount"],
  expenses: ["Date", "Supplier", "Category", "Amount"],
  clients: ["Name"],
  products: ["Product Name", "Sell Price"],
}

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  revenue: "Revenue",
  expenses: "Expenses",
  clients: "Clients",
  products: "Products",
}

const OPTIONAL_FIELDS_MAP: Record<ImportType, string[]> = {
  revenue: [
    "Notes",
    "Discount",
    "Net Sales",
    "Cancel Amount",
    "Short/Over",
    "Refund",
    "Final Amount",
    "Status",
  ],
  expenses: [
    "Invoice Number",
    "Due Date",
    "Tax",
    "Final Amount",
    "Status",
    "Notes",
  ],
  clients: [
    "Email",
    "Phone Number",
    "Company Name",
    "Customer Type",
    "Address",
    "City",
    "State",
    "Postal Code",
    "Country",
    "Tax Number",
    "Notes",
  ],
  products: [
    "SKU",
    "Category",
    "Description",
    "Cost Price",
    "Stock Quantity",
    "Unit Type",
    "Reorder Level",
  ],
}

export function CSVUploader({
  importType,
  fields,
  onImportTypeChange,
  onParsed,
}: CSVUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [isParsing, setIsParsing] = useState(false)

  const handleFile = async (file: File | undefined) => {
    setError("")
    if (!file) {
      return
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a CSV file.")
      return
    }
    setIsParsing(true)
    try {
      const result = await parseCsvFile(file)
      if (result.headers.length === 0) {
        setError("The CSV file does not contain a header row.")
        return
      }
      onParsed(file.name, result)
    } catch {
      setError("The CSV file could not be parsed as UTF-8 text.")
    } finally {
      setIsParsing(false)
    }
  }

  const requiredList =
    fields && fields.length > 0
      ? fields.filter((f) => f.required).map((f) => f.label)
      : REQUIRED_FIELDS_MAP[importType]

  const optionalList =
    fields && fields.length > 0
      ? fields.filter((f) => !f.required).map((f) => f.label)
      : OPTIONAL_FIELDS_MAP[importType]

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <Label>Import type</Label>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <Button
            type="button"
            variant={importType === "revenue" ? "default" : "outline"}
            onClick={() => onImportTypeChange("revenue")}
          >
            Revenue
          </Button>
          <Button
            type="button"
            variant={importType === "expenses" ? "default" : "outline"}
            onClick={() => onImportTypeChange("expenses")}
          >
            Expenses
          </Button>
          <Button
            type="button"
            variant={importType === "clients" ? "default" : "outline"}
            onClick={() => onImportTypeChange("clients")}
          >
            Clients
          </Button>
          <Button
            type="button"
            variant={importType === "products" ? "default" : "outline"}
            onClick={() => onImportTypeChange("products")}
          >
            Products
          </Button>
        </div>
      </div>

      <div className="space-y-4 flex flex-col justify-between">
        <div className="rounded-lg border bg-blue-50/50 p-4 text-sm dark:bg-blue-950/20 dark:border-blue-900/50 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground flex items-center gap-1.5 shrink-0">
              <Info className="size-4 text-blue-600 dark:text-blue-400" />
              Required fields for {IMPORT_TYPE_LABELS[importType]}:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {requiredList.map((fieldName) => (
                <Badge
                  key={fieldName}
                  variant="secondary"
                  className="font-medium text-xs bg-background dark:bg-muted border border-border"
                >
                  {fieldName} <span className="text-destructive ml-0.5">*</span>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-blue-200/60 dark:border-blue-900/40">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5 shrink-0">
              Optional / Additional fields:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {optionalList.map((fieldName) => (
                <Badge
                  key={fieldName}
                  variant="outline"
                  className="font-normal text-xs bg-background/50 dark:bg-muted/50 text-muted-foreground border-border"
                >
                  {fieldName}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="flex min-h-52 flex-1 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center transition-colors hover:bg-muted/40"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mb-3 size-8 text-muted-foreground" />
          <span className="font-medium">
            {isParsing ? "Reading CSV..." : "Upload CSV"}
          </span>
          <span className="mt-1 text-sm text-muted-foreground">
            UTF-8 CSV files with comma, semicolon, tab, or pipe delimiters
          </span>
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          {error ? (
            <span className="mt-3 text-sm text-destructive">{error}</span>
          ) : null}
        </button>
      </div>
    </div>
  )
}
