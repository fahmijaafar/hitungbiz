import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type BankAccountCreate, BankAccountsService } from "@/client"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
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
import { getLocalDateString } from "@/lib/utils"
import { handleError } from "@/utils"

const malaysianBanks = [
  "Affin Bank",
  "Alliance Bank",
  "AmBank",
  "Bank Islam",
  "Bank Muamalat",
  "Bank Rakyat",
  "BSN",
  "CIMB Bank",
  "Citibank",
  "Hong Leong Bank",
  "HSBC Bank",
  "Kuwait Finance House",
  "Maybank",
  "OCBC Bank",
  "Public Bank",
  "RHB Bank",
  "Standard Chartered",
  "UOB Bank",
] as const

const numericField = z.union([z.string(), z.number()]).pipe(z.coerce.number())

const formSchema = z.object({
  bank_name: z.string().min(1, { message: "Bank name is required" }),
  account_name: z.string().min(1, { message: "Account name is required" }),
  account_number: z.string().min(1, { message: "Account number is required" }),
  account_type: z.enum(["current", "savings", "others"] as const),
  opening_balance: numericField.pipe(z.number()),
  opening_date: z.string().min(1, { message: "Opening date is required" }),
  notes: z.string().optional(),
})

type FormInput = z.input<typeof formSchema>
type FormData = z.output<typeof formSchema>

const AddBankAccount = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      bank_name: "",
      account_name: "",
      account_number: "",
      account_type: "current",
      opening_balance: 0,
      opening_date: getLocalDateString(),
      notes: "",
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: BankAccountCreate) => {
      return await BankAccountsService.createBankAccount({ requestBody: data })
    },
    onSuccess: () => {
      showSuccessToast("Bank account created successfully")
      form.reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["bank_accounts"] })
      queryClient.invalidateQueries({ queryKey: ["bank-accounts-infinite"] })
    },
  })

  const onSubmit = (data: FormData) => {
    const companyId = localStorage.getItem("company_id")
    const payload: BankAccountCreate = {
      bank_name: data.bank_name,
      account_name: data.account_name,
      account_number: data.account_number,
      account_type: data.account_type,
      opening_balance: Number(data.opening_balance),
      opening_date: data.opening_date,
      notes: data.notes || undefined,
      company_id: companyId,
    }
    mutation.mutate(payload)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          className="my-4 h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4"
          aria-label="Add Bank Account"
          title="Add Bank Account"
        >
          <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
          <span className="hidden sm:inline">Add Bank Account</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
          <DialogDescription>
            Fill in the bank account details.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col max-h-[75vh]"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 px-1">
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {malaysianBanks.map((bank) => (
                            <SelectItem key={bank} value={bank}>
                              {bank}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="account_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Account holder name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="account_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input placeholder="1234567890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="account_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Type</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">Current</SelectItem>
                          <SelectItem value="savings">Savings</SelectItem>
                          <SelectItem value="others">Others</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="opening_balance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opening Balance</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="opening_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opening Date</FormLabel>
                    <FormControl>
                      <DateInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="sm:col-span-2">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes..."
                          className="resize-none"
                          {...field}
                        />
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
  )
}

export default AddBankAccount
