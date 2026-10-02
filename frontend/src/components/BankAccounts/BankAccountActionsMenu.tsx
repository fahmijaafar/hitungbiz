import { EllipsisVertical } from "lucide-react-motion"
import { useState } from "react"

import type { BankAccountPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteBankAccount from "./DeleteBankAccount"
import EditBankAccount from "./EditBankAccount"
import ViewBankAccount from "./ViewBankAccount"

interface BankAccountActionsMenuProps {
  bankAccount: BankAccountPublic
}

export const BankAccountActionsMenu = ({
  bankAccount,
}: BankAccountActionsMenuProps) => {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${bankAccount.account_name}`}
        >
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ViewBankAccount bankAccount={bankAccount} />
        <EditBankAccount
          bankAccount={bankAccount}
          onSuccess={() => setOpen(false)}
        />
        <DeleteBankAccount
          id={bankAccount.id}
          onSuccess={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default BankAccountActionsMenu
