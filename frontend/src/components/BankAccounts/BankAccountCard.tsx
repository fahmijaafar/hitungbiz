import { Building2, Copy, CopyCheck, Wallet } from "lucide-react-motion"
import { useState } from "react"
import type { BankAccountPublic } from "@/client"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { BankAccountActionsMenu } from "./BankAccountActionsMenu"
import EditBankAccount from "./EditBankAccount"

interface BankAccountCardProps {
  bankAccount: BankAccountPublic
}

export function BankAccountCard({ bankAccount }: BankAccountCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [copiedText, copy] = useCopyToClipboard()

  const isCopied = copiedText === bankAccount.account_number
  const accountTypeLabel =
    bankAccount.account_type === "current"
      ? "Current"
      : bankAccount.account_type === "savings"
        ? "Savings"
        : "Others"

  return (
    <>
      <div
        onClick={() => setIsEditOpen(true)}
        className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:shadow-md hover:border-primary/40 cursor-pointer"
      >
        <div>
          {/* Top Header Section: Title & Actions Menu */}
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-base leading-snug text-foreground break-words min-w-0 flex-1 group-hover:text-primary transition-colors">
              {bankAccount.account_name}
            </h3>
            <div
              className="shrink-0 -mr-1 -mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <BankAccountActionsMenu bankAccount={bankAccount} />
            </div>
          </div>

          {/* Bank Name */}
          <p className="mt-1 text-sm text-muted-foreground font-normal">
            {bankAccount.bank_name || "—"}
          </p>

          {/* Horizontal Divider */}
          <div className="my-3.5 border-t border-border/60" />

          {/* Details Row: Account Number & Account Type */}
          <div className="grid grid-cols-12 items-center gap-2 text-sm font-medium">
            {/* Account Number with Copy */}
            <div className="col-span-7 sm:col-span-8 flex items-center gap-1.5 min-w-0">
              <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="font-mono text-foreground truncate min-w-0">
                {bankAccount.account_number}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  copy(bankAccount.account_number)
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                title="Copy account number"
                aria-label="Copy account number"
              >
                {isCopied ? (
                  <CopyCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Account Type */}
            <div className="col-span-5 sm:col-span-4 flex items-center justify-end gap-1.5 min-w-0 text-right">
              <Wallet className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="truncate text-foreground font-medium capitalize">
                {accountTypeLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      <EditBankAccount
        bankAccount={bankAccount}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSuccess={() => setIsEditOpen(false)}
      />
    </>
  )
}

export default BankAccountCard
