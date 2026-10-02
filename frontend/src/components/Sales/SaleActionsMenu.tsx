import { EllipsisVertical, Pencil, Trash2 } from "lucide-react-motion"
import { useState } from "react"

import type { SalePublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteSale from "./DeleteSale"
import EditSale from "./EditSale"

interface SaleActionsMenuProps {
  sale: SalePublic
}

export const SaleActionsMenu = ({ sale }: SaleActionsMenuProps) => {
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
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setEditOpen(true)
            }}
          >
            <Pencil />
            Edit Revenue
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
            Delete Revenue
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditSale sale={sale} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteSale id={sale.id} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}

export default SaleActionsMenu
