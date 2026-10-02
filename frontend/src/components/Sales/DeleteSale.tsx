import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { SalesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

interface DeleteSaleProps {
  id: string
  onSuccess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const DeleteSale = ({
  id,
  onSuccess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: DeleteSaleProps) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = externalOpen !== undefined
  const isOpen = isControlled ? externalOpen : internalOpen

  const setIsOpen = (val: boolean) => {
    if (isControlled) {
      externalOnOpenChange?.(val)
    } else {
      setInternalOpen(val)
    }
  }
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()

  const deleteSale = async (id: string) => {
    await SalesService.deleteSale({ id: id })
  }

  const mutation = useMutation({
    mutationFn: deleteSale,
    onSuccess: () => {
      showSuccessToast("The revenue was deleted successfully")
      setIsOpen(false)
      onSuccess?.()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const onSubmit = async () => {
    mutation.mutate(id)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => e.preventDefault()}
          onClick={() => setIsOpen(true)}
        >
          <Trash2 />
          Delete Revenue
        </DropdownMenuItem>
      )}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Delete Revenue</DialogTitle>
            <DialogDescription>
              This revenue will be permanently deleted. Are you sure? You will
              not be able to undo this action.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline" disabled={mutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              variant="destructive"
              type="submit"
              loading={mutation.isPending}
            >
              Delete
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteSale
