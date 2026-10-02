import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { Search, TrendingUp } from "lucide-react-motion"
import { Suspense } from "react"
import { SalesService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import PendingTable from "@/components/Pending/PendingTable"
import AddSale from "@/components/Sales/AddSale"
import MobileSalesCards from "@/components/Sales/MobileSalesCards"
import { columns } from "@/components/Sales/SaleColumn"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"

export const Route = createFileRoute("/_layout/sales")({
  component: Sales,
  head: () => ({
    meta: [
      {
        title: `Revenue - ${APP_NAME}`,
      },
    ],
  }),
})

function SalesTableContent() {
  const companyId = useCurrentCompanyId()
  const { data: sales } = useSuspenseQuery({
    queryKey: ["sales", companyId],
    queryFn: () =>
      SalesService.readSales({ skip: 0, limit: 100, companyId: companyId }),
  })

  if (sales.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">
          You don't have any revenue yet
        </h3>
        <p className="text-muted-foreground">
          Add a new revenue entry to get started
        </p>
      </div>
    )
  }

  return <DataTable columns={columns} data={sales.data} />
}

function SalesTable() {
  return (
    <Suspense
      fallback={<PendingTable columns={columns as ColumnDef<unknown>[]} />}
    >
      <SalesTableContent />
    </Suspense>
  )
}

function Sales() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
            <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
          </div>
          <p className="text-muted-foreground">Manage your revenue</p>
        </div>
        <AddSale />
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        <MobileSalesCards />
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block">
        <SalesTable />
      </div>
    </div>
  )
}

export default Sales
