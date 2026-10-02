import { Eye } from "lucide-react-motion"

import type { DocumentPublic } from "@/client"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

type ViewDocumentProps = {
  document: DocumentPublic
}

const ViewDocument = ({ document }: ViewDocumentProps) => {
  const handleView = () => {
    const url = `/documents/view/${document.id}`
    window.open(url, "_blank")
  }

  return (
    <DropdownMenuItem
      onSelect={(event) => event.preventDefault()}
      onClick={handleView}
    >
      <Eye />
      View Document
    </DropdownMenuItem>
  )
}

export default ViewDocument
