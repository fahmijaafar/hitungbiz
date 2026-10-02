import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { CompaniesService, type CompanyPublic } from "@/client"
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
import { LoadingButton } from "@/components/ui/loading-button"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

interface DeleteCompanyProps {
  company: CompanyPublic
}

export default function DeleteCompany({ company }: DeleteCompanyProps) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()
  const { user: currentUser } = useAuth()

  const isOwner =
    Boolean(currentUser?.is_superuser) ||
    Boolean(
      currentUser?.id &&
        company.user_id &&
        String(currentUser.id) === String(company.user_id),
    )

  const isActiveCompany =
    Boolean(currentUser?.company_id) &&
    String(currentUser?.company_id) === String(company.id)

  const deleteCompanyMutation = useMutation({
    mutationFn: () => CompaniesService.deleteCompany({ id: company.id }),
    onSuccess: () => {
      const currentUser = queryClient.getQueryData<{
        company_id?: string | null
      }>(["currentUser"])
      if (String(currentUser?.company_id) === String(company.id)) {
        localStorage.removeItem("company_id")
      }
      showSuccessToast("Company removed")
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["subscription-details"] })
    },
  })

  const onSubmit = () => {
    if (isActiveCompany) return
    deleteCompanyMutation.mutate()
  }

  if (!isOwner) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          title={
            isActiveCompany ? "Cannot delete active company" : "Delete company"
          }
        >
          <span className="sr-only">Delete company</span>
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
            {isActiveCompany ? (
              <DialogDescription className="space-y-2 pt-2">
                <p>
                  <span className="font-semibold text-foreground">
                    {company.company_name}
                  </span>{" "}
                  is currently set as your active company, hence cannot be
                  deleted.
                </p>
                <p>
                  To delete this company, create another company first and
                  switch to that company.
                </p>
              </DialogDescription>
            ) : (
              <DialogDescription>
                Company{" "}
                <span className="font-semibold">{company.company_name}</span>{" "}
                will be permanently deleted. Are you sure? You will not be able
                to undo this action.
              </DialogDescription>
            )}
          </DialogHeader>

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button
                variant="outline"
                disabled={deleteCompanyMutation.isPending}
              >
                Cancel
              </Button>
            </DialogClose>
            {!isActiveCompany && (
              <LoadingButton
                variant="destructive"
                type="submit"
                loading={deleteCompanyMutation.isPending}
              >
                Delete
              </LoadingButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
