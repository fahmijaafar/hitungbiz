import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { RecurringService } from "@/client"
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
import type { RecurringSchedule } from "@/routes/_layout/recurring-invoices"
import { handleError } from "@/utils"

interface DeleteRecurringInvoiceProps {
  schedule: RecurringSchedule
}

export function DeleteRecurringInvoice({
  schedule,
}: DeleteRecurringInvoiceProps) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()

  const mutation = useMutation({
    mutationFn: () => RecurringService.deleteRecurring({ id: schedule.id }),
    onSuccess: () => {
      showSuccessToast("Recurring invoice deleted successfully")
      setIsOpen(false)
      queryClient.invalidateQueries({ queryKey: ["recurring-schedules"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = () => {
    mutation.mutate()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuItem
        variant="destructive"
        onSelect={(event) => event.preventDefault()}
        onClick={() => setIsOpen(true)}
      >
        <Trash2 />
        Delete Recurring Invoice
      </DropdownMenuItem>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Delete Recurring Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete recurring invoice{" "}
              <span className="font-semibold">{schedule.name}</span>? This
              action cannot be undone.
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

export default DeleteRecurringInvoice
