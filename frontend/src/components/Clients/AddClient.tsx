import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  type ClientCreate,
  type ClientPublic,
  ClientsService,
  UsersService,
} from "@/client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import useCustomToast from "@/hooks/useCustomToast"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { handleError } from "@/utils"

const formSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone_number: z.string().optional(),
  company_name: z.string().optional(),
  customer_type: z.string().min(1, { message: "Customer type is required" }),
  reg_number: z.string().optional(),
  billing_address: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

export interface AddClientProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: (client: ClientPublic) => void
  trigger?: React.ReactNode
  companyId?: string | null
}

const AddClient = ({
  open,
  onOpenChange,
  onSuccess,
  trigger,
  companyId: customCompanyId,
}: AddClientProps = {}) => {
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
    feature: "customers",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 50,
    recommendedPlan: "pro",
  })

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
  })

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      name: "",
      email: "",
      phone_number: "",
      company_name: "",
      customer_type: "",
      reg_number: "",
      billing_address: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: ClientCreate) => {
      return await ClientsService.createClient({ requestBody: data })
    },
    onSuccess: (data: ClientPublic) => {
      showSuccessToast("Client created successfully")
      form.reset()
      setIsOpen(false)
      onSuccess?.(data)
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
          feature: errDetail.feature || "customers",
          currentPlan: errDetail.plan || "personal",
          currentUsage: errDetail.current_usage ?? 0,
          limit: errDetail.limit ?? 50,
          recommendedPlan:
            errDetail.next_plan ?? UPGRADE_PATH[errDetail.plan] ?? null,
        })
      } else {
        handleError.bind(showErrorToast)(err)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] })
    },
  })

  const onSubmit = (data: FormData) => {
    const storedCompanyId =
      typeof window !== "undefined" ? localStorage.getItem("company_id") : null
    const companyId =
      customCompanyId ??
      (storedCompanyId &&
      storedCompanyId !== "undefined" &&
      storedCompanyId !== "null" &&
      storedCompanyId !== ""
        ? storedCompanyId
        : (currentUser?.company_id ?? null))

    const payload: ClientCreate = {
      name: data.name ?? "",
      email: data.email ?? "",
      phone_number: data.phone_number || null,
      company_name: data.company_name || null,
      customer_type: data.customer_type ?? "",
      reg_number: data.reg_number || null,
      billing_address: data.billing_address || null,
      company_id: companyId,
    }

    mutation.mutate(payload)
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
              aria-label="Add Client"
              title="Add Client"
            >
              <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Client</span>
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent className="max-w-full sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Client</DialogTitle>
            <DialogDescription>Fill in the client details.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col max-h-[75vh]"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 px-1">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Client name"
                          type="text"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="client@example.com"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="+60 12-345 6789"
                          type="tel"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Company name"
                          type="text"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customer_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Type</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="individual">
                              Individual
                            </SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reg_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Number</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Registration number"
                          type="text"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="billing_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Address</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Billing address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <DialogFooter className="pt-4 border-t shrink-0">
                <DialogClose asChild>
                  <Button variant="outline" disabled={mutation.isPending}>
                    Cancel
                  </Button>
                </DialogClose>
                <LoadingButton type="submit" loading={mutation.isPending}>
                  Save
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

export default AddClient
