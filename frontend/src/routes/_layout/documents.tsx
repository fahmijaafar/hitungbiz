import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { FileText, Search } from "lucide-react-motion"
import { Suspense } from "react"
import { DocumentsService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddDocument from "@/components/Documents/AddDocument"
import { columns } from "@/components/Documents/DocumentColumn"
import MobileDocumentCards from "@/components/Documents/MobileDocumentCards"
import PendingTable from "@/components/Pending/PendingTable"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/_layout/documents")({
  component: Documents,
  head: () => ({
    meta: [
      {
        title: `Documents - ${APP_NAME}`,
      },
    ],
  }),
})

function DocumentsTableContent() {
  const companyId = useCurrentCompanyId()
  const { data: documents } = useSuspenseQuery({
    queryKey: ["documents", companyId],
    queryFn: () =>
      DocumentsService.readDocuments({
        skip: 0,
        limit: 100,
        companyId,
      }),
  })

  if (documents.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">
          You don't have any documents yet
        </h3>
        <p className="text-muted-foreground">
          Add a new document to get started
        </p>
      </div>
    )
  }

  return <DataTable columns={columns} data={documents.data} />
}

function DocumentsTable() {
  return (
    <Suspense
      fallback={<PendingTable columns={columns as ColumnDef<unknown>[]} />}
    >
      <DocumentsTableContent />
    </Suspense>
  )
}

function Documents() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="font-bold text-2xl tracking-tight">Documents</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your quotations, invoices, payment vouchers, and delivery
            orders
          </p>
        </div>
        <AddDocument />
      </div>
      {/* Mobile Card View */}
      <div className="md:hidden">
        <MobileDocumentCards />
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block">
        <DocumentsTable />
      </div>
    </div>
  )
}

export default Documents
