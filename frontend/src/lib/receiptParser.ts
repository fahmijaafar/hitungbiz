export interface ParsedReceipt {
  amount?: number
  tax?: number
  date?: string // normalized to YYYY-MM-DD
  due_date?: string // normalized to YYYY-MM-DD
  vendor?: string
  category?: string
  invoice_no?: string
  description?: string
}

const AMOUNT_REGEX = /(\d{1,3}(?:[,\s]\d{3})*\.\d{2}|\d+\.\d{2})/g
const DATE_REGEX =
  /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/

function normalizeDate(match: RegExpMatchArray): string | undefined {
  let year: number
  let month: number
  let day: number

  if (match[1]) {
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  } else {
    day = Number(match[4])
    month = Number(match[5])
    year = Number(match[6])
    if (year < 100) {
      year += 2000
    }
  }

  // Tolerate ambiguous DD/MM vs MM/DD ordering when the month is clearly a day.
  if (month > 12 && day <= 12) {
    const swap = month
    month = day
    day = swap
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * Best-effort extraction of expense/bill fields from raw OCR receipt text.
 * All fields are optional and intended only as suggestions for the user.
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const result: ParsedReceipt = {}

  // Amount: prefer lines that mention a total, otherwise scan everything and
  // take the largest currency-like value found.
  const totalLine = lines.find((line) =>
    /total|amount due|grand total|balance/i.test(line),
  )
  const amountSources = totalLine ? [totalLine] : lines
  const candidates: number[] = []
  for (const line of amountSources) {
    const matches = line.match(AMOUNT_REGEX)
    if (matches) {
      for (const match of matches) {
        candidates.push(Number(match.replace(/[,\s]/g, "")))
      }
    }
  }
  if (candidates.length > 0) {
    result.amount = Math.max(...candidates)
  }

  // Date: first parseable date, normalized to YYYY-MM-DD.
  const dateMatch = text.match(DATE_REGEX)
  if (dateMatch) {
    const normalized = normalizeDate(dateMatch)
    if (normalized) {
      result.date = normalized
    }
  }

  // Vendor: first reasonably long line near the top without obvious numbers
  // or boilerplate keywords.
  result.vendor = lines.find(
    (line) =>
      line.length > 2 &&
      !/\d{2,}/.test(line) &&
      !/receipt|invoice|tel|date|total/i.test(line),
  )

  // Description: a short snippet from the top of the receipt.
  const snippet = lines.slice(0, 3).join(" ").slice(0, 200)
  if (snippet) {
    result.description = snippet
  }

  return result
}
