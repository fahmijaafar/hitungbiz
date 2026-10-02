import { useMutation, useQueryClient } from "@tanstack/react-query"
import { UserMinus } from "lucide-react-motion"
import { useState } from "react"

import { CompaniesService, type StaffMemberPublic } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

interface DeleteStaffProps {
  companyId: string
  staff: StaffMemberPublic
  onSuccess?: () => void
  trigger?: React.ReactNode
}

export function DeleteStaff({
  companyId,
  staff,
  onSuccess,
  trigger,
}: DeleteStaffProps) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const displayName = staff.name || staff.email

  const mutation = useMutation({
    mutationFn: async () => {
      return CompaniesService.removeCompanyStaff({
        companyId: companyId,
        userId: staff.id,
      })
    },
    onSuccess: () => {
      showSuccessToast("Staff member removed successfully.")
      setIsOpen(false)
      onSuccess?.()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", companyId] })
    },
  })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => e.preventDefault()}
          onClick={() => setIsOpen(true)}
        >
          <UserMinus className="h-4 w-4 mr-2" />
          Remove Staff
        </DropdownMenuItem>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {displayName} from this company?</DialogTitle>
          <DialogDescription>
            They will immediately lose access to this company.
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
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={mutation.isPending}
          >
            Remove Staff
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteStaff
