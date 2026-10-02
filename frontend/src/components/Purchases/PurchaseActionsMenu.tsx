import { EllipsisVertical, Pencil, Trash2 } from "lucide-react-motion"
import { useState } from "react"

import type { PurchasePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeletePurchase from "./DeletePurchase"
import EditPurchase from "./EditPurchase"
import ViewPurchase from "./ViewPurchase"

interface PurchaseActionsMenuProps {
  purchase: PurchasePublic
}

export const PurchaseActionsMenu = ({ purchase }: PurchaseActionsMenuProps) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <ViewPurchase purchase={purchase} />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setEditOpen(true)
            }}
          >
            <Pencil />
            Edit Expense
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setDeleteOpen(true)
            }}
          >
            <Trash2 />
            Delete Expense
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditPurchase
        purchase={purchase}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeletePurchase
        id={purchase.id}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

export default PurchaseActionsMenu
