import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy } from "lucide-react-motion"
import { useState } from "react"

import {
  CompaniesService,
  type DocumentCreate,
  type DocumentPublic,
  DocumentsService,
  SalesService,
} from "@/client"
import DocumentForm, {
  type DocumentFormPayload,
  type DocumentFormSubmitOptions,
} from "@/components/Documents/DocumentForm"
import { createRevenuePayloadFromInvoice } from "@/components/Documents/revenueFromInvoice"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import useCustomToast from "@/hooks/useCustomToast"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { handleError } from "@/utils"

type DuplicateDocumentProps = {
  document: DocumentPublic
  onSuccess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function getTodayDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const DuplicateDocument = ({
  document,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DuplicateDocumentProps) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen

  const setIsOpen = (nextOpen: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(nextOpen)
    } else {
      setInternalOpen(nextOpen)
    }
  }
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
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
      const duplicatedDocument = await DocumentsService.createDocument({
        requestBody: payload,
      })
      if (options?.saveAsRevenue) {
        await SalesService.createSale({
          requestBody: createRevenuePayloadFromInvoice(duplicatedDocument),
        })
      }
      if (payload.company_id && nextRunningNumbers) {
        await CompaniesService.updateCompany({
          id: payload.company_id,
          requestBody: { document_running_numbers: nextRunningNumbers },
        })
      }
      return duplicatedDocument
    },
    onSuccess: () => {
      showSuccessToast("Document duplicated successfully")
      setIsOpen(false)
      onSuccess?.()
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
        {!isControlled && (
          <DropdownMenuItem
            onSelect={(event) => event.preventDefault()}
            onClick={() => setIsOpen(true)}
          >
            <Copy />
            Duplicate Document
          </DropdownMenuItem>
        )}
        <DialogContent className="max-w-full sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Duplicate Document</DialogTitle>
            <DialogDescription>
              Review the copied document details before creating it.
            </DialogDescription>
          </DialogHeader>
          <DocumentForm
            document={document}
            initialDate={getTodayDate()}
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

export default DuplicateDocument
