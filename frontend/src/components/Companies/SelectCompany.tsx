import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BadgeCheck } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { type CompanyPublic, UsersService } from "@/client"
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
import useCustomToast from "@/hooks/useCustomToast"
import { setAppCurrency } from "@/lib/currency"
import { handleError } from "@/utils"

interface SelectCompanyProps {
  company: CompanyPublic
  selected?: boolean
}

export default function SelectCompany({
  company,
  selected = false,
}: SelectCompanyProps) {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { handleSubmit } = useForm()

  const selectCompanyMutation = useMutation({
    mutationFn: () =>
      UsersService.updateUserMe({ requestBody: { company_id: company.id } }),
    onSuccess: (user) => {
      if (user.company_id) {
        localStorage.setItem("company_id", user.company_id)
      }
      setAppCurrency(company.currency)
      showSuccessToast("Company selected")
      setIsOpen(false)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["sales"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = () => {
    selectCompanyMutation.mutate()
  }

  if (selected) {
    return (
      <span className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-primary/50 bg-primary/15 px-3 text-sm font-medium text-primary dark:bg-primary/25 dark:text-primary-foreground dark:border-primary/60">
        <BadgeCheck className="h-4 w-4" />
        Selected
      </span>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="shrink-0">
          Select
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Select Company</DialogTitle>
            <DialogDescription>
              Are you sure you want to select{" "}
              <span className="font-semibold">{company.company_name}</span> as
              your active company?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button
                variant="outline"
                disabled={selectCompanyMutation.isPending}
              >
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton
              variant="default"
              type="submit"
              loading={selectCompanyMutation.isPending}
            >
              Select
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
