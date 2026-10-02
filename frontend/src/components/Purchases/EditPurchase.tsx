import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react-motion"
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  type PurchasePublic,
  PurchasesService,
  type PurchaseUpdate,
} from "@/client"
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
} from "@/components/ui/dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
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
  supplier_name: z.string().min(1, { message: "Supplier is required" }),
  invoice_no: z.string().optional(),
  category: z.string().min(1, { message: "Category is required" }),
  amount: numericField.pipe(z.number().min(0)),
  tax: numericField.pipe(z.number().min(0)),
  status: z.string().min(1, { message: "Status is required" }),
  notes: z.string().optional(),
})

type FormInput = z.input<typeof formSchema>
type FormData = z.output<typeof formSchema>

interface EditPurchaseProps {
  purchase: PurchasePublic
  onSuccess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const EditPurchase = ({
  purchase,
  onSuccess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: EditPurchaseProps) => {
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
  const companyId = localStorage.getItem("company_id")

  const { data: latestPurchase } = useQuery({
    queryKey: ["purchase", purchase.id],
    queryFn: () => PurchasesService.readPurchase({ id: purchase.id }),
    enabled: isOpen,
    initialData: purchase,
  })

  const currentPurchase = latestPurchase ?? purchase

  const { data: suppliersData } = useQuery({
    queryKey: ["expense-suppliers", companyId],
    queryFn: () => PurchasesService.readPurchasesSuppliers({ companyId }),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })
  const expenseSuppliers = suppliersData?.data ?? []

  const initialDate = getLocalDateString(currentPurchase.date)

  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      date: initialDate,
      due_date: currentPurchase.due_date
        ? getLocalDateString(currentPurchase.due_date)
        : "",
      supplier_name: currentPurchase.supplier_name,
      category: currentPurchase.category ?? "",
      invoice_no: currentPurchase.invoice_no ?? "",
      amount: currentPurchase.amount,
      tax: currentPurchase.tax,
      status: currentPurchase.status ?? "Paid",
      notes: currentPurchase.notes ?? "",
    },
  })

  useEffect(() => {
    if (isOpen) {
      const curDate = getLocalDateString(currentPurchase.date)
      form.reset({
        date: curDate,
        due_date: currentPurchase.due_date
          ? getLocalDateString(currentPurchase.due_date)
          : "",
        supplier_name: currentPurchase.supplier_name,
        category: currentPurchase.category ?? "",
        invoice_no: currentPurchase.invoice_no ?? "",
        amount: currentPurchase.amount,
        tax: currentPurchase.tax,
        status: currentPurchase.status ?? "Paid",
        notes: currentPurchase.notes ?? "",
      })
    }
  }, [isOpen, currentPurchase, form])

  const { watch } = form
  const amount = Number(watch("amount") ?? 0)
  const tax = Number(watch("tax") ?? 0)
  const finalAmount = useMemo(() => amount + tax, [amount, tax])

  const mutation = useMutation({
    mutationFn: async (data: PurchaseUpdate) => {
      return await PurchasesService.updatePurchase({
        id: purchase.id,
        requestBody: data,
      })
    },
    onSuccess: () => {
      showSuccessToast("Expense updated successfully")
      setIsOpen(false)
      onSuccess?.()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] })
      queryClient.invalidateQueries({ queryKey: ["purchases-infinite"] })
      queryClient.invalidateQueries({ queryKey: ["purchase", purchase.id] })
      queryClient.invalidateQueries({
        queryKey: ["expense-suppliers", companyId],
      })
    },
  })

  const onSubmit = (data: FormData) => {
    const payload: PurchaseUpdate = {
      date: new Date(data.date).toISOString(),
      due_date: data.due_date ? new Date(data.due_date).toISOString() : null,
      supplier_name: data.supplier_name.trim(),
      category: data.category,
      invoice_no: data.invoice_no ? data.invoice_no.trim() : null,
      amount: Number(data.amount),
      tax: Number(data.tax),
      final_amount: finalAmount,
      status: data.status,
      notes: data.notes ?? "",
    }

    mutation.mutate(payload)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => setIsOpen(true)}
        >
          <Pencil />
          Edit Expense
        </DropdownMenuItem>
      )}
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription>Update the expense details.</DialogDescription>
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
                          {PURCHASE_CATEGORIES.map((group) => (
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
                name="tax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

export default EditPurchase
