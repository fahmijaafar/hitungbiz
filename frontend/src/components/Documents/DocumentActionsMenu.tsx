import { Copy, EllipsisVertical, Pencil, Trash2 } from "lucide-react-motion"
import { useState } from "react"

import type { DocumentPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import ConvertQuotationToInvoice from "./ConvertQuotationToInvoice"
import DeleteDocument from "./DeleteDocument"
import DuplicateDocument from "./DuplicateDocument"
import EditDocument from "./EditDocument"
import ShareDocument from "./ShareDocument"
import ViewDocument from "./ViewDocument"

type DocumentActionsMenuProps = {
  document: DocumentPublic
}

export const DocumentActionsMenu = ({ document }: DocumentActionsMenuProps) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <EllipsisVertical />
            <span className="sr-only">Open document actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <ViewDocument document={document} />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setEditOpen(true)
            }}
          >
            <Pencil />
            Edit Document
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setDuplicateOpen(true)
            }}
          >
            <Copy />
            Duplicate Document
          </DropdownMenuItem>
          <ShareDocument
            document={document}
            onSuccess={() => setMenuOpen(false)}
          />
          <ConvertQuotationToInvoice
            document={document}
            onSuccess={() => setMenuOpen(false)}
          />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setDeleteOpen(true)
            }}
          >
            <Trash2 />
            Delete Document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditDocument
        document={document}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DuplicateDocument
        document={document}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
      />
      <DeleteDocument
        id={document.id}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

export default DocumentActionsMenu
