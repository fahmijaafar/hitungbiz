import { Eye } from "lucide-react-motion"
import { useState } from "react"

import type { BankAccountPublic } from "@/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { formatCurrency } from "@/lib/currency"
import { formatDateDMY } from "@/lib/utils"

interface ViewBankAccountProps {
  bankAccount: BankAccountPublic
}

function formatDate(dateString: string | undefined | null): string {
  return formatDateDMY(dateString)
}

const ViewBankAccount = ({ bankAccount }: ViewBankAccountProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const bankLabel = bankAccount.bank_name

  const typeLabel =
    bankAccount.account_type === "current"
      ? "Current"
      : bankAccount.account_type === "savings"
        ? "Savings"
        : "Others"

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuItem
        onSelect={(e) => e.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Eye />
        View Details
      </DropdownMenuItem>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bank Account Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Bank Name</p>
              <p className="font-medium">{bankLabel}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Type</p>
              <p className="font-medium capitalize">{typeLabel}</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Account Name</p>
              <p className="font-medium">{bankAccount.account_name}</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Account Number</p>
              <p className="font-mono font-medium">
                {bankAccount.account_number}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Opening Balance</p>
              <p className="font-medium">
                {formatCurrency(bankAccount.opening_balance)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Opening Date</p>
              <p className="font-medium">
                {formatDate(bankAccount.opening_date)}
              </p>
            </div>
            {bankAccount.notes && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm whitespace-pre-wrap">
                  {bankAccount.notes}
                </p>
              </div>
            )}
            {bankAccount.created_at && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Created At</p>
                <p className="text-sm">{formatDate(bankAccount.created_at)}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ViewBankAccount
