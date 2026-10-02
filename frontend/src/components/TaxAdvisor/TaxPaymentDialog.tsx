import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CreditCard, Loader as Loader2, Trash2 } from "lucide-react-motion"
import { useState } from "react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency } from "@/lib/currency"
import {
  deleteTaxPayment,
  getTaxPayments,
  recordTaxPayment,
} from "@/lib/taxAdvisor"
import { getLocalDateString } from "@/lib/utils"

interface TaxPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyId: string
  year: number
  onPaymentSuccess?: () => void
}

export function TaxPaymentDialog({
  open,
  onOpenChange,
  companyId,
  year,
  onPaymentSuccess,
}: TaxPaymentDialogProps) {
  const queryClient = useQueryClient()
  const today = getLocalDateString()

  const [paymentDate, setPaymentDate] = useState(today)
  const [amount, setAmount] = useState("")
  const [paymentType, setPaymentType] = useState("cp500")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["taxPayments", companyId, year],
    queryFn: () => getTaxPayments(companyId, year),
    enabled: open && Boolean(companyId),
  })

  const payments = paymentsData?.data ?? []

  const recordMutation = useMutation({
    mutationFn: (numAmount: number) =>
      recordTaxPayment(companyId, year, {
        payment_date: paymentDate,
        amount: numAmount,
        payment_type: paymentType,
        reference,
        notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["taxPayments", companyId, year],
      })
      queryClient.invalidateQueries({
        queryKey: ["taxAdvisor", companyId, year],
      })
      setAmount("")
      setReference("")
      setNotes("")
      setErrorMsg(null)
      if (onPaymentSuccess) onPaymentSuccess()
    },
    onError: (err: unknown) => {
      setErrorMsg(
        (err as { message?: string })?.message || "Failed to record payment",
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (paymentId: string) =>
      deleteTaxPayment(companyId, year, paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["taxPayments", companyId, year],
      })
      queryClient.invalidateQueries({
        queryKey: ["taxAdvisor", companyId, year],
      })
      if (onPaymentSuccess) onPaymentSuccess()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    const parsedAmount = Number.parseFloat(amount)
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Please enter a valid amount greater than 0.")
      return
    }
    recordMutation.mutate(parsedAmount)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-[640px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <DialogTitle>Tax Payments ({year})</DialogTitle>
          </div>
          <DialogDescription>
            Record LHDN tax installment payments (CP500, CP207, or final tax
            payments).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 border-b pb-6 mt-2"
        >
          <h4 className="text-sm font-semibold">Record New Tax Payment</h4>
          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-rose-700 dark:border-red-900 dark:bg-red-950 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-date" className="text-xs">
                Payment Date
              </Label>
              <DateInput
                id="payment-date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount" className="text-xs">
                Amount (RM)
              </Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 1500.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-type" className="text-xs">
                Payment Type
              </Label>
              <Select
                value={paymentType}
                onValueChange={(val) => setPaymentType(val)}
              >
                <SelectTrigger id="payment-type" className="h-9 w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cp500">CP500 Installment</SelectItem>
                  <SelectItem value="cp207">CP207 Payment</SelectItem>
                  <SelectItem value="installment">
                    General Tax Installment
                  </SelectItem>
                  <SelectItem value="final">Final Tax Settlement</SelectItem>
                  <SelectItem value="custom">Other Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-reference" className="text-xs">
                Reference / Receipt No.
              </Label>
              <Input
                id="payment-reference"
                placeholder="e.g. CP500-2025-01"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-notes" className="text-xs">
              Notes (Optional)
            </Label>
            <Input
              id="payment-notes"
              placeholder="e.g. Paid via LHDN ByrHASiL online"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button size="sm" type="submit" disabled={recordMutation.isPending}>
              {recordMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Tax Payment
            </Button>
          </div>
        </form>

        {/* Existing Tax Payments List */}
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Recorded Payments History</h4>
          {isLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Loading recorded payments...
            </div>
          ) : payments.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No tax payments recorded for {year} yet.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Ref</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-medium">
                        {p.payment_date}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {p.payment_type}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.reference || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-rose-500 hover:bg-red-50 hover:text-rose-700"
                          onClick={() => deleteMutation.mutate(p.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
