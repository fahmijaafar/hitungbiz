import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type SaleCreate, SalesService } from "@/client"
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
import useCustomToast from "@/hooks/useCustomToast"
import { getLocalDateString } from "@/lib/utils"
import { handleError } from "@/utils"

const numericField = z.union([z.string(), z.number()]).pipe(z.coerce.number())

const formSchema = z.object({
  date: z.string().min(1, { message: "Date is required" }),
  description: z.string().optional(),
  channel: z.string().min(1, { message: "Channel is required" }),
  gross_amount: numericField.pipe(z.number().min(0)),
  discount: numericField.pipe(z.number().min(0)),
  cancel_amount: numericField.pipe(z.number().min(0)),
  short_over: numericField,
  refund: numericField.pipe(z.number().min(0)),
  status: z.enum(["Pending", "Completed", "Canceled"]),
})

type FormInput = z.input<typeof formSchema>
type FormData = z.output<typeof formSchema>

function computeNetSales(
  gross: number,
  discount: number,
  cancelAmount: number,
  shortOver: number,
) {
  return gross - discount - cancelAmount + (shortOver || 0)
}

function computeFinalAmount(netSales: number, refund: number) {
  return netSales - (refund || 0)
}

const AddSale = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const companyId = localStorage.getItem("company_id")

  const { data: salesChannelsData } = useQuery({
    queryKey: ["revenue-channels", companyId],
    queryFn: () => SalesService.readSalesChannels({ companyId }),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })
  const revenueChannels = salesChannelsData?.data ?? []

  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      date: getLocalDateString(), // date format YYYY-MM-DD
      description: "",
      channel: "",
      gross_amount: 0,
      discount: 0,
      cancel_amount: 0,
      short_over: 0,
      refund: 0,
      status: "Completed",
    },
  })

  const { watch } = form
  const gross = Number(watch("gross_amount") ?? 0)
  const discount = Number(watch("discount") ?? 0)
  const cancel_amount = Number(watch("cancel_amount") ?? 0)
  const short_over = Number(watch("short_over") ?? 0)
  const refund = Number(watch("refund") ?? 0)

  const net_sales = computeNetSales(gross, discount, cancel_amount, short_over)
  const final_amount = computeFinalAmount(net_sales, refund)

  const mutation = useMutation({
    mutationFn: async (data: SaleCreate) => {
      return await SalesService.createSale({ requestBody: data })
    },
    onSuccess: () => {
      showSuccessToast("Revenue created successfully")
      form.reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] })
      queryClient.invalidateQueries({
        queryKey: ["revenue-channels", companyId],
      })
    },
  })

  const onSubmit = (data: FormData) => {
    // convert datetime-local to ISO
    const payload: SaleCreate = {
      date: data.date,
      channel: (data.channel ?? "").trim(),
      notes: data.description ?? "",
      company_id: companyId,
      gross_amount: Number(data.gross_amount),
      discount: Number(data.discount),
      net_sales: computeNetSales(
        Number(data.gross_amount),
        Number(data.discount),
        Number(data.cancel_amount),
        Number(data.short_over),
      ),
      cancel_amount: Number(data.cancel_amount),
      short_over: Number(data.short_over),
      refund: Number(data.refund),
      final_amount: computeFinalAmount(net_sales, Number(data.refund)),
      status: data.status,
    }

    mutation.mutate(payload)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          className="my-4 h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
          aria-label="Add Revenue"
          title="Add Revenue"
        >
          <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
          <span className="hidden sm:inline">Add Revenue</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Revenue</DialogTitle>
          <DialogDescription>Fill in the revenue details.</DialogDescription>
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
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel</FormLabel>
                    <FormControl>
                      <AutocompleteInput
                        suggestions={revenueChannels}
                        placeholder="Channel"
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
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="Canceled">Canceled</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gross_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gross amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cancel_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cancel amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="short_over"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short / Over</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="refund"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refund</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Net revenue</FormLabel>
                <FormControl>
                  <Input value={String(net_sales)} disabled />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel>Final amount</FormLabel>
                <FormControl>
                  <Input value={String(final_amount)} disabled />
                </FormControl>
              </FormItem>

              <div className="sm:col-span-2">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
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

export default AddSale
