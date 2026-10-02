import { Eye } from "lucide-react-motion"
import { useState } from "react"

import type { PurchasePublic } from "@/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { formatCurrency } from "@/lib/currency"
import { formatDateDMY } from "@/lib/utils"

interface ViewPurchaseProps {
  purchase: PurchasePublic
}

function formatDate(dateString: string | undefined | null): string {
  return formatDateDMY(dateString)
}

const ViewPurchase = ({ purchase }: ViewPurchaseProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Eye />
        View Expense
      </DropdownMenuItem>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Expense Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{formatDate(purchase.date)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Due Date</p>
              <p className="font-medium">{formatDate(purchase.due_date)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">Supplier</p>
              <p className="font-medium">{purchase.supplier_name}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">Category</p>
              <p className="font-medium">{purchase.category ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Invoice Number</p>
              <p className="font-mono font-medium">
                {purchase.invoice_no || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-medium">{purchase.status ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="font-medium">{formatCurrency(purchase.amount)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tax</p>
              <p className="font-medium">{formatCurrency(purchase.tax)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Final Amount</p>
              <p className="font-semibold">
                {formatCurrency(purchase.final_amount)}
              </p>
            </div>
            {purchase.notes && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{purchase.notes}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ViewPurchase
