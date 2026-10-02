import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DraftRecord, ImportType } from "@/lib/csvImport"
import { getDraftPreview } from "@/lib/csvImport"

type Filter = "all" | "valid" | "invalid"

type ImportPreviewTableProps = {
  importType: ImportType
  records: DraftRecord[]
  onRecordsChange: (records: DraftRecord[]) => void
}

const PAGE_SIZE = 25

export function ImportPreviewTable({
  importType,
  records,
  onRecordsChange,
}: ImportPreviewTableProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim()
    return records.filter((record) => {
      if (filter !== "all" && record.status !== filter) {
        return false
      }
      if (!needle) {
        return true
      }
      return (
        getDraftPreview(record, importType).toLowerCase().includes(needle) ||
        record.errors.join(" ").toLowerCase().includes(needle) ||
        JSON.stringify(record.original_row).toLowerCase().includes(needle)
      )
    })
  }, [filter, importType, records, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  const updateRecord = (rowNumber: number, selected: boolean) => {
    onRecordsChange(
      records.map((record) =>
        record.row_number === rowNumber ? { ...record, selected } : record,
      ),
    )
  }

  const bulkSelect = (selected: boolean) => {
    const visible = new Set(filtered.map((record) => record.row_number))
    onRecordsChange(
      records.map((record) =>
        visible.has(record.row_number) ? { ...record, selected } : record,
      ),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "valid", "invalid"] as Filter[]).map((item) => (
            <Button
              key={item}
              type="button"
              variant={filter === item ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter(item)
                setPage(1)
              }}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => bulkSelect(true)}
          >
            Select All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => bulkSelect(false)}
          >
            Unselect All
          </Button>
        </div>
        <Input
          className="lg:max-w-xs"
          placeholder="Search rows"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>Row</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Transaction Preview</TableHead>
            <TableHead>Validation Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((record) => (
            <TableRow key={record.row_number}>
              <TableCell>
                <Checkbox
                  checked={record.selected}
                  disabled={record.status !== "valid"}
                  onCheckedChange={(checked) =>
                    updateRecord(record.row_number, checked === true)
                  }
                />
              </TableCell>
              <TableCell>{record.row_number}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    record.status === "valid" ? "default" : "destructive"
                  }
                >
                  {record.status}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[360px] truncate">
                {getDraftPreview(record, importType) || "-"}
              </TableCell>
              <TableCell className="max-w-[520px] whitespace-normal text-muted-foreground">
                {record.errors.length > 0 ? record.errors.join("; ") : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination className="justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(event) => {
                event.preventDefault()
                setPage((value) => Math.max(1, value - 1))
              }}
            />
          </PaginationItem>
          <PaginationItem className="px-3 text-sm text-muted-foreground">
            Page {currentPage} of {pageCount}
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(event) => {
                event.preventDefault()
                setPage((value) => Math.min(pageCount, value + 1))
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
