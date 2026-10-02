import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { CompaniesService, type StaffMemberPublic } from "@/client"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { handleError } from "@/utils"

const formSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email address" }),
})

type FormData = z.infer<typeof formSchema>

export interface AddStaffProps {
  companyId: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: (staff: StaffMemberPublic) => void
  trigger?: React.ReactNode
}

export function AddStaff({
  companyId,
  open,
  onOpenChange,
  onSuccess,
  trigger,
}: AddStaffProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = (value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value)
    } else {
      setInternalOpen(value)
    }
  }

  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [upgradeModalState, setUpgradeModalState] = useState<{
    open: boolean
    feature: string
    currentPlan: string
    currentUsage: number
    limit: number
    recommendedPlan?: string | null
  }>({
    open: false,
    feature: "staff",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 1,
    recommendedPlan: "pro",
  })

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    defaultValues: {
      email: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      return CompaniesService.addCompanyStaff({
        companyId: companyId,
        requestBody: { email: data.email.trim() },
      })
    },
    onSuccess: (res) => {
      showSuccessToast("Staff member added successfully.")
      setIsOpen(false)
      form.reset()
      onSuccess?.(res)
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
          feature: errDetail.feature || "staff",
          currentPlan: errDetail.plan || "personal",
          currentUsage: errDetail.current_usage ?? 0,
          limit: errDetail.limit ?? 1,
          recommendedPlan:
            errDetail.next_plan ?? UPGRADE_PATH[errDetail.plan] ?? null,
        })
      } else {
        handleError.bind(showErrorToast)(err)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["staff", companyId] })
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {trigger ? (
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        ) : !isControlled ? (
          <DialogTrigger asChild>
            <Button
              className="my-4 h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4"
              aria-label="Add Staff"
              title="Add Staff"
            >
              <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Staff</span>
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Staff</DialogTitle>
            <DialogDescription>
              Add an existing user to this company using their email address.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 pt-2"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="user@example.com"
                        type="email"
                        className="rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-4">
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={mutation.isPending}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <LoadingButton
                  type="submit"
                  loading={mutation.isPending}
                  disabled={mutation.isPending}
                >
                  Add Staff
                </LoadingButton>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <UpgradeModal
        {...upgradeModalState}
        onClose={() =>
          setUpgradeModalState((prev) => ({ ...prev, open: false }))
        }
      />
    </>
  )
}

export default AddStaff
