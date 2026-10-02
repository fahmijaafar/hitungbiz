import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { Search, TrendingDown } from "lucide-react-motion"
import { Suspense, useState } from "react"
import { PurchasesService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import ScanReceipt from "@/components/Common/ScanReceipt"
import PendingTable from "@/components/Pending/PendingTable"
import AddPurchase from "@/components/Purchases/AddPurchase"
import MobilePurchasesCards from "@/components/Purchases/MobilePurchasesCards"
import { columns } from "@/components/Purchases/PurchaseColumn"
import { useCurrentCompanyId } from "@/hooks/useCompany"
import { APP_NAME } from "@/lib/app"
import type { ParsedReceipt } from "@/lib/receiptParser"

export const Route = createFileRoute("/_layout/purchases")({
  component: Purchases,
  head: () => ({
    meta: [
      {
        title: `Expenses - ${APP_NAME}`,
      },
    ],
  }),
})

function PurchasesTableContent() {
  const companyId = useCurrentCompanyId()
  const { data: purchases } = useSuspenseQuery({
    queryKey: ["purchases", companyId],
    queryFn: () =>
      PurchasesService.readPurchases({
        skip: 0,
        limit: 100,
        companyId: companyId,
      }),
  })

  if (purchases.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">
          You don't have any expenses yet
        </h3>
        <p className="text-muted-foreground">
          Add a new expense entry to get started
        </p>
      </div>
    )
  }

  return <DataTable columns={columns} data={purchases.data} />
}

function PurchasesTable() {
  return (
    <Suspense
      fallback={<PendingTable columns={columns as ColumnDef<unknown>[]} />}
    >
      <PurchasesTableContent />
    </Suspense>
  )
}

function Purchases() {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [scanned, setScanned] = useState<ParsedReceipt | undefined>(undefined)

  const handleScanned = (fields: ParsedReceipt) => {
    setScanned(fields)
    setIsAddOpen(true)
  }

  const handleOpenChange = (open: boolean) => {
    setIsAddOpen(open)
    if (!open) {
      // Drop suggested values so a later manual "Add Expense" starts blank.
      setScanned(undefined)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-rose-500 dark:text-rose-400" />
            <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          </div>
          <p className="text-muted-foreground">Manage your expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <ScanReceipt onScanned={handleScanned} />
          <AddPurchase
            open={isAddOpen}
            onOpenChange={handleOpenChange}
            initialValues={
              scanned
                ? {
                    supplier_name: scanned.vendor,
                    amount: scanned.amount,
                    tax_percent:
                      scanned.amount && scanned.amount > 0 && scanned.tax
                        ? Math.round((scanned.tax / scanned.amount) * 10000) /
                          100
                        : undefined,
                    date: scanned.date,
                    due_date: scanned.due_date,
                    category: scanned.category,
                    invoice_no: scanned.invoice_no,
                    notes: scanned.description,
                  }
                : undefined
            }
          />
        </div>
      </div>
      {/* Mobile Card View */}
      <div className="md:hidden">
        <MobilePurchasesCards />
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block">
        <PurchasesTable />
      </div>
    </div>
  )
}

export default Purchases
