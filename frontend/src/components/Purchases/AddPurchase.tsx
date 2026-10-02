import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type PurchaseCreate, PurchasesService } from "@/client"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
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
import PURCHASE_CATEGORIES from "@/constants/purchaseCategories"
import useCustomToast from "@/hooks/useCustomToast"
import { getLocalDateString } from "@/lib/utils"
import { handleError } from "@/utils"

const numericField = z.union([z.string(), z.number()]).pipe(z.coerce.number())

const formSchema = z.object({
  date: z.string().min(1, { message: "Date is required" }),
  due_date: z.string().optional(),
  supplier_name: z.string().min(1, { message: "Supplier name is required" }),
  category: z.string().min(1, { message: "Category is required" }),
  invoice_no: z.string().optional(),
  amount: numericField.pipe(z.number().min(0)),
  tax_percent: numericField.pipe(z.number().min(0)),
  status: z.string().min(1, { message: "Status is required" }),
  notes: z.string().optional(),
})

type FormInput = z.input<typeof formSchema>
type FormData = z.output<typeof formSchema>

const getDefaultValues = (): FormInput => ({
  date: getLocalDateString(),
  due_date: "",
  supplier_name: "",
  category: "",
  invoice_no: "",
  amount: 0,
  tax_percent: 0,
  status: "Paid",
  notes: "",
})

interface AddPurchaseProps {
  /** Suggested values (e.g. from receipt OCR) to prefill the form when opened. */
  initialValues?: Partial<FormInput>
  /** Controlled open state. When omitted, the dialog manages its own state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const AddPurchase = ({
  initialValues,
  open,
  onOpenChange,
}: AddPurchaseProps = {}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const companyId = localStorage.getItem("company_id")

  const { data: suppliersData } = useQuery({
    queryKey: ["expense-suppliers", companyId],
    queryFn: () => PurchasesService.readPurchasesSuppliers({ companyId }),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })
  const expenseSuppliers = suppliersData?.data ?? []

  const setIsOpen = (value: boolean) => {
    onOpenChange?.(value)
    if (!isControlled) {
      setInternalOpen(value)
    }
  }

  const categoriesGroups = PURCHASE_CATEGORIES

  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: getDefaultValues(),
  })

  // When the dialog opens, reset the form to blank defaults merged with any
  // suggested (OCR-derived) values. All fields remain fully editable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open transition
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const suggested = Object.fromEntries(
      Object.entries(initialValues ?? {}).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    )
    form.reset({ ...getDefaultValues(), ...suggested })
  }, [isOpen])

  const { watch } = form
  const amount = Number(watch("amount") ?? 0)
  const taxPercent = Number(watch("tax_percent") ?? 0)
  const taxAmount = useMemo(
    () => amount * (taxPercent / 100),
    [amount, taxPercent],
  )
  const finalAmount = useMemo(() => amount + taxAmount, [amount, taxAmount])

  const mutation = useMutation({
    mutationFn: async (data: PurchaseCreate) => {
      return await PurchasesService.createPurchase({ requestBody: data })
    },
    onSuccess: () => {
      showSuccessToast("Expense created successfully")
      form.reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] })
      queryClient.invalidateQueries({ queryKey: ["purchases-infinite"] })
      queryClient.invalidateQueries({
        queryKey: ["expense-suppliers", companyId],
      })
    },
  })

  const onSubmit = (data: FormData) => {
    const payload: PurchaseCreate = {
      date: new Date(data.date).toISOString(),
      due_date: data.due_date ? new Date(data.due_date).toISOString() : null,
      supplier_name: data.supplier_name.trim(),
      category: data.category,
      invoice_no: data.invoice_no ? data.invoice_no.trim() : null,
      company_id: companyId,
      amount: Number(data.amount),
      tax: taxAmount,
      final_amount: finalAmount,
      status: data.status,
      notes: data.notes ?? "",
    }

    mutation.mutate(payload)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          className="my-4 h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4 bg-rose-600 hover:bg-rose-700 text-white"
          aria-label="Add Expense"
          title="Add Expense"
        >
          <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
          <span className="hidden sm:inline">Add Expense</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
          <DialogDescription>Fill in the expense details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col max-h-[75vh]"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 px-1">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <DateInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <DateInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="supplier_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl>
                      <AutocompleteInput
                        suggestions={expenseSuppliers}
                        placeholder="Supplier name"
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
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categoriesGroups.map((group) => (
                            <div key={group.title}>
                              <div className="px-2 py-1 text-sm font-semibold text-muted-foreground">
                                {group.title}
                              </div>
                              {group.items.map((item) => (
                                <SelectItem
                                  key={`${group.title}-${item}`}
                                  value={item}
                                >
                                  {item}
                                </SelectItem>
                              ))}
                            </div>
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
                name="invoice_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Invoice number"
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
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tax_percent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax %</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Tax Amount</FormLabel>
                <FormControl>
                  <Input value={taxAmount.toFixed(2)} disabled />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Final Amount</FormLabel>
                <FormControl>
                  <Input value={finalAmount.toFixed(2)} disabled />
                </FormControl>
              </FormItem>

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Paid">Paid</SelectItem>
                          <SelectItem value="Partially Paid">
                            Partially Paid
                          </SelectItem>
                          <SelectItem value="Unpaid">Unpaid</SelectItem>
                        </SelectContent>
                      </Select>
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
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
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

export default AddPurchase
