export type ImportType = "revenue" | "expenses" | "clients" | "products"
export type ImportStep =
  | "upload"
  | "mapping"
  | "draft"
  | "validation"
  | "review"
  | "import"

export type ImportField = {
  key: string
  label: string
  type: "string" | "number" | "date" | "datetime"
  required: boolean
  unique: boolean
  aliases: string[]
  default?: unknown
}

export type CsvParseResult = {
  headers: string[]
  rows: Record<string, string>[]
  delimiter: string
}

export type DraftRecord = {
  row_number: number
  selected: boolean
  status: "valid" | "invalid" | "pending"
  errors: string[]
  original_row: Record<string, string>
  data: Record<string, unknown>
}

const DELIMITERS = [",", ";", "\t", "|"]

export function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[#_/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function parseCsvRows(text: string, delimiter: string) {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      row.push(field)
      field = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1
      }
      row.push(field)
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row)
      }
      field = ""
      row = []
      continue
    }

    field += char
  }

  row.push(field)
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row)
  }

  return rows
}

function detectDelimiter(text: string) {
  const preview = text.split(/\r?\n/).slice(0, 5).join("\n")
  return DELIMITERS.map((delimiter) => {
    const rows = parseCsvRows(preview, delimiter)
    const counts = rows.map((row) => row.length).filter((count) => count > 1)
    const first = counts[0] ?? 0
    const consistent = counts.filter((count) => count === first).length
    return { delimiter, score: first * 10 + consistent }
  }).sort((a, b) => b.score - a.score)[0].delimiter
}

export async function parseCsvFile(file: File): Promise<CsvParseResult> {
  const text = await file.text()
  const delimiter = detectDelimiter(text)
  const parsedRows = parseCsvRows(text.replace(/^\uFEFF/, ""), delimiter)
  const headers = (parsedRows[0] ?? []).map((header, index) => {
    const trimmed = header.trim()
    return trimmed || `Column ${index + 1}`
  })
  const rows = parsedRows
    .slice(1)
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, (row[index] ?? "").trim()]),
      ),
    )

  return { headers, rows, delimiter }
}

export function detectMapping(headers: string[], fields: ImportField[]) {
  const aliases = new Map<string, string>()
  for (const field of fields) {
    aliases.set(normalizeHeader(field.label), field.key)
    aliases.set(normalizeHeader(field.key), field.key)
    for (const alias of field.aliases) {
      aliases.set(normalizeHeader(alias), field.key)
    }
  }

  const used = new Set<string>()
  return Object.fromEntries(
    headers.map((header) => {
      const key = aliases.get(normalizeHeader(header)) ?? ""
      if (!key || used.has(key)) {
        return [header, ""]
      }
      used.add(key)
      return [header, key]
    }),
  )
}

export function buildDraftRecords(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): DraftRecord[] {
  return rows.map((row, index) => {
    const data = Object.fromEntries(
      Object.entries(mapping)
        .filter(([, field]) => field)
        .map(([csvColumn, field]) => [field, row[csvColumn] ?? ""]),
    )
    return {
      row_number: index + 2,
      selected: true,
      status: "pending",
      errors: [],
      original_row: row,
      data,
    }
  })
}

export function getDraftPreview(record: DraftRecord, importType: ImportType) {
  if (importType === "revenue") {
    return [
      record.data.date,
      record.data.channel,
      record.data.final_amount ?? record.data.gross_amount,
    ]
      .filter(Boolean)
      .join(" - ")
  }

  if (importType === "expenses") {
    return [
      record.data.date,
      record.data.supplier_name,
      record.data.invoice_no,
      record.data.final_amount ?? record.data.amount,
    ]
      .filter(Boolean)
      .join(" - ")
  }

  if (importType === "clients") {
    return [
      record.data.name,
      record.data.company_name,
      record.data.email,
      record.data.phone_number,
    ]
      .filter(Boolean)
      .join(" - ")
  }

  if (importType === "products") {
    return [
      record.data.product_name,
      record.data.sku,
      record.data.category,
      record.data.sell_price != null && record.data.sell_price !== ""
        ? `Price: ${record.data.sell_price}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" - ")
  }

  return ""
}

export function toCsvValue(value: unknown) {
  const text = value == null ? "" : String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}
