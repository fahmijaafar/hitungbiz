import { EllipsisVertical, Phone } from "lucide-react-motion"
import { useState } from "react"

import type { ClientPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import DeleteClient from "./DeleteClient"
import EditClient from "./EditClient"

interface ClientActionsMenuProps {
  client: ClientPublic
}

export const ClientActionsMenu = ({ client }: ClientActionsMenuProps) => {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${client.name}`}
        >
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {client.phone_number ? (
          <DropdownMenuItem asChild>
            <a href={`tel:${client.phone_number}`}>
              <Phone className="h-4 w-4" />
              Call Client
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <Phone className="h-4 w-4 opacity-50" />
            Call Client
          </DropdownMenuItem>
        )}
        <EditClient client={client} onSuccess={() => setOpen(false)} />
        <DeleteClient id={client.id} onSuccess={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ClientActionsMenu
