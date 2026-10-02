type ValidationSummaryProps = {
  totalRows: number
  validRows: number
  invalidRows: number
  selectedRows: number
}

export function ValidationSummary({
  totalRows,
  validRows,
  invalidRows,
  selectedRows,
}: ValidationSummaryProps) {
  const items = [
    ["Total rows", totalRows],
    ["Valid rows", validRows],
    ["Invalid rows", invalidRows],
    ["Selected rows", selectedRows],
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border bg-card px-4 py-3">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{value}</div>
        </div>
      ))}
    </div>
  )
}
