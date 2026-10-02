import { CircleAlert as AlertCircle } from "lucide-react-motion"
import { useMemo } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import type { ImportField } from "@/lib/csvImport"

const IGNORE = "__ignore__"

type CSVHeaderMapperProps = {
  headers: string[]
  rows: Record<string, string>[]
  fields: ImportField[]
  mapping: Record<string, string>
  onMappingChange: (mapping: Record<string, string>) => void
  onContinue: () => void
}

export function CSVHeaderMapper({
  headers,
  rows,
  fields,
  mapping,
  onMappingChange,
  onContinue,
}: CSVHeaderMapperProps) {
  const duplicateFields = useMemo(() => {
    const counts = new Map<string, number>()
    for (const value of Object.values(mapping)) {
      if (!value) {
        continue
      }
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([field]) => field),
    )
  }, [mapping])

  const missingRequired = fields.filter(
    (field) => field.required && !Object.values(mapping).includes(field.key),
  )
  const hasErrors =
    fields.length === 0 ||
    duplicateFields.size > 0 ||
    missingRequired.length > 0

  const updateMapping = (header: string, value: string) => {
    onMappingChange({ ...mapping, [header]: value === IGNORE ? "" : value })
  }

  return (
    <div className="space-y-4">
      {hasErrors ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Mapping needs attention</AlertTitle>
          <AlertDescription>
            {fields.length === 0 ? "Import fields are still loading. " : ""}
            {missingRequired.length > 0
              ? `Required fields missing: ${missingRequired
                  .map((field) => field.label)
                  .join(", ")}. `
              : ""}
            {duplicateFields.size > 0
              ? "Each Target field can only be mapped once."
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>CSV Column</TableHead>
            <TableHead>Sample Value</TableHead>
            <TableHead>Target Field</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {headers.map((header) => {
            const mappedField = mapping[header] ?? ""
            const isDuplicate = mappedField && duplicateFields.has(mappedField)
            return (
              <TableRow key={header}>
                <TableCell className="font-medium">{header}</TableCell>
                <TableCell className="max-w-[260px] truncate text-muted-foreground">
                  {rows[0]?.[header] || "-"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Select
                      value={mappedField || IGNORE}
                      onValueChange={(value) => updateMapping(header, value)}
                    >
                      <SelectTrigger
                        className={isDuplicate ? "border-destructive" : ""}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE}>Ignore Column</SelectItem>
                        {fields.map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                            {field.required ? " *" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isDuplicate ? (
                      <Badge variant="destructive">Duplicate</Badge>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <Button disabled={hasErrors} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
