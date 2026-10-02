import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react-motion"
import { useState } from "react"

import {
  type DocumentPublic,
  DocumentsService,
  type DocumentUpdate,
  PurchasesService,
  SalesService,
} from "@/client"
import DocumentForm, {
  type DocumentFormPayload,
  type DocumentFormSubmitOptions,
} from "@/components/Documents/DocumentForm"
import { createExpensePayloadFromPaymentVoucher } from "@/components/Documents/expenseFromPaymentVoucher"
import { createRevenuePayloadFromInvoice } from "@/components/Documents/revenueFromInvoice"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

type EditDocumentProps = {
  document: DocumentPublic
  onSuccess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const EditDocument = ({
  document,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EditDocumentProps) => {
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

  const mutation = useMutation({
    mutationFn: async ({
      payload,
      options,
    }: {
      payload: DocumentUpdate
      options?: DocumentFormSubmitOptions
    }) => {
      const updatedDocument = await DocumentsService.updateDocument({
        id: document.id,
        requestBody: payload,
      })
      if (options?.saveAsRevenue) {
        await SalesService.createSale({
          requestBody: createRevenuePayloadFromInvoice(updatedDocument),
        })
      }
      if (options?.saveAsExpense && options.expenseCategory) {
        await PurchasesService.createPurchase({
          requestBody: createExpensePayloadFromPaymentVoucher(
            updatedDocument,
            options.expenseCategory,
          ),
        })
      }
      if (options?.deductInventory) {
        await DocumentsService.deductDocumentInventory({ id: document.id })
      }
      return updatedDocument
    },
    onSuccess: () => {
      showSuccessToast("Document updated successfully")
      setIsOpen(false)
      onSuccess?.()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] })
      queryClient.invalidateQueries({ queryKey: ["sales"] })
      queryClient.invalidateQueries({ queryKey: ["purchases"] })
      queryClient.invalidateQueries({ queryKey: ["products"] })
    },
  })

  const handleSubmit = (
    payload: DocumentFormPayload,
    _nextRunningNumbers?: Record<string, number>,
    options?: DocumentFormSubmitOptions,
  ) => {
    mutation.mutate({ payload: payload as DocumentUpdate, options })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DropdownMenuItem
          onSelect={(event) => event.preventDefault()}
          onClick={() => setIsOpen(true)}
        >
          <Pencil />
          Edit Document
        </DropdownMenuItem>
      )}
      <DialogContent className="max-w-full sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
        </DialogHeader>
        <DocumentForm
          document={document}
          mode="edit"
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
        />
      </DialogContent>
    </Dialog>
  )
}

export default EditDocument
