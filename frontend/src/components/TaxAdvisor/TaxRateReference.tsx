import { ChevronDown, ChevronUp, Landmark } from "lucide-react-motion"
import { useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/currency"
import type { TaxRateBracket } from "@/lib/taxAdvisor"

interface TaxRateReferenceProps {
  brackets: TaxRateBracket[]
  year: number
  taxpayerType?: string
}

function getTaxRateTitle(taxpayerType?: string) {
  switch (taxpayerType) {
    case "corporate_sme":
      return "Corporate SME Income Tax Rates"
    case "corporate_standard":
      return "Standard Corporate Income Tax Rates"
    default:
      return "Individual Business Income Tax Rates"
  }
}

export function TaxRateReference({
  brackets,
  year,
  taxpayerType,
}: TaxRateReferenceProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full p-5 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2.5">
          <Landmark className="h-5 w-5 text-primary" />
          <div>
            <h4 className="font-semibold text-base">
              {getTaxRateTitle(taxpayerType)} Reference ({year})
            </h4>
            <p className="text-xs text-muted-foreground">
              Malaysian LHDN tax brackets and rates configured in database.
            </p>
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground">
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="p-5 border-t bg-muted/10">
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[10%] text-center">Seq</TableHead>
                  <TableHead className="w-[45%]">
                    Chargeable Income Range
                  </TableHead>
                  <TableHead className="w-[20%] text-center">
                    Tax Rate
                  </TableHead>
                  <TableHead className="w-[25%] text-right">
                    Max Tax in Bracket
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brackets.map((b) => {
                  const maxBracketTax =
                    b.max_amount !== null
                      ? (b.max_amount - b.min_amount) * (b.rate / 100.0)
                      : null

                  const rangeText =
                    b.max_amount !== null
                      ? `RM${b.min_amount.toLocaleString()} – RM${b.max_amount.toLocaleString()}`
                      : `Above RM${b.min_amount.toLocaleString()}`

                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {b.sequence}
                      </TableCell>
                      <TableCell className="font-medium">
                        {b.description} ({rangeText})
                      </TableCell>
                      <TableCell className="text-center font-semibold">
                        {b.rate}%
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {maxBracketTax !== null
                          ? formatCurrency(maxBracketTax)
                          : "No Cap"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
