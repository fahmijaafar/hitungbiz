import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useState } from "react"

import {
  CompaniesService,
  type DocumentCreate,
  DocumentsService,
  PurchasesService,
  SalesService,
} from "@/client"
import DocumentForm, {
  type DocumentFormPayload,
  type DocumentFormSubmitOptions,
} from "@/components/Documents/DocumentForm"
import { createExpensePayloadFromPaymentVoucher } from "@/components/Documents/expenseFromPaymentVoucher"
import { createRevenuePayloadFromInvoice } from "@/components/Documents/revenueFromInvoice"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { handleError } from "@/utils"

const AddDocument = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [upgradeModalState, setUpgradeModalState] = useState({
    open: false,
    feature: "documents",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 20,
    limitType: undefined as string | undefined,
    retryAt: null as string | null,
    recommendedPlan: "pro" as string | null,
  })
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: async ({
      payload,
      nextRunningNumbers,
      options,
    }: {
      payload: DocumentCreate
      nextRunningNumbers?: Record<string, number>
      options?: DocumentFormSubmitOptions
    }) => {
      const document = await DocumentsService.createDocument({
        requestBody: payload,
      })
      if (options?.saveAsRevenue) {
        await SalesService.createSale({
          requestBody: createRevenuePayloadFromInvoice(document),
        })
      }
      if (options?.saveAsExpense && options.expenseCategory) {
        await PurchasesService.createPurchase({
          requestBody: createExpensePayloadFromPaymentVoucher(
            document,
            options.expenseCategory,
          ),
        })
      }
      if (options?.deductInventory) {
        await DocumentsService.deductDocumentInventory({ id: document.id })
      }
      if (payload.company_id && nextRunningNumbers) {
        await CompaniesService.updateCompany({
          id: payload.company_id,
          requestBody: { document_running_numbers: nextRunningNumbers },
        })
      }
      return document
    },
    onSuccess: () => {
      showSuccessToast("Document created successfully")
      setIsOpen(false)
    },
    onError: (err: any) => {
      const errDetail = err?.body?.detail
      if (
        errDetail &&
        typeof errDetail === "object" &&
        errDetail.error === "LIMIT_REACHED"
      ) {
        setIsOpen(false)
        setUpgradeModalState({
          open: true,
          feature: errDetail.feature || "documents",
          currentPlan: errDetail.plan || "personal",
          currentUsage: errDetail.current_usage ?? 0,
          limit: errDetail.limit ?? 20,
          limitType: errDetail.limit_type,
          retryAt: errDetail.retry_at ?? null,
          recommendedPlan:
            errDetail.next_plan ?? UPGRADE_PATH[errDetail.plan] ?? null,
        })
      } else {
        handleError.bind(showErrorToast)(err)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] })
      queryClient.invalidateQueries({ queryKey: ["sales"] })
      queryClient.invalidateQueries({ queryKey: ["purchases"] })
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["company"] })
      queryClient.invalidateQueries({ queryKey: ["companyName"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
    },
  })

  const handleSubmit = (
    payload: DocumentFormPayload,
    nextRunningNumbers?: Record<string, number>,
    options?: DocumentFormSubmitOptions,
  ) => {
    mutation.mutate({
      payload: payload as DocumentCreate,
      nextRunningNumbers,
      options,
    })
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            className="my-4 h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4"
            aria-label="Add Document"
            title="Add Document"
          >
            <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Document</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-full sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
            <DialogDescription>Fill in the document details.</DialogDescription>
          </DialogHeader>
          <DocumentForm
            mode="create"
            onSubmit={handleSubmit}
            isPending={mutation.isPending}
          />
        </DialogContent>
      </Dialog>
      <UpgradeModal
        open={upgradeModalState.open}
        onClose={() =>
          setUpgradeModalState((prev) => ({ ...prev, open: false }))
        }
        feature={upgradeModalState.feature}
        currentPlan={upgradeModalState.currentPlan}
        currentUsage={upgradeModalState.currentUsage}
        limit={upgradeModalState.limit}
        limitType={upgradeModalState.limitType}
        retryAt={upgradeModalState.retryAt}
        recommendedPlan={upgradeModalState.recommendedPlan}
      />
    </>
  )
}

export default AddDocument
