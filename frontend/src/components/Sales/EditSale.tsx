import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react-motion"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type SalePublic, SalesService, type SaleUpdate } from "@/client"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import { Button } from "@/components/ui/button"
import { DateInput } from "@/components/ui/date-input"
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import useCustomToast from "@/hooks/useCustomToast"
import { getLocalDateString } from "@/lib/utils"
import { handleError } from "@/utils"

const saleStatuses = ["Pending", "Completed", "Canceled"] as const

const numericField = z.union([z.string(), z.number()]).pipe(z.coerce.number())

const formSchema = z.object({
  date: z.string().min(1),
  description: z.string().optional(),
  channel: z.string().min(1),
  gross_amount: numericField.pipe(z.number().min(0)),
  discount: numericField.pipe(z.number().min(0)),
  cancel_amount: numericField.pipe(z.number().min(0)),
  short_over: numericField,
  refund: numericField.pipe(z.number().min(0)),
  status: z.enum(saleStatuses),
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

function getSaleStatus(status: string) {
  return saleStatuses.includes(status as (typeof saleStatuses)[number])
    ? (status as (typeof saleStatuses)[number])
    : "Completed"
}

interface EditSaleProps {
  sale: SalePublic
  onSuccess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const EditSale = ({
  sale,
  onSuccess,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: EditSaleProps) => {
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

  const { data: latestSale } = useQuery({
    queryKey: ["sale", sale.id],
    queryFn: () => SalesService.readSale({ id: sale.id }),
    enabled: isOpen,
    initialData: sale,
  })

  const currentSale = latestSale ?? sale

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
      date: getLocalDateString(currentSale.date),
      description: currentSale.notes,
      channel: currentSale.channel,
      gross_amount: currentSale.gross_amount,
      discount: currentSale.discount,
      cancel_amount: currentSale.cancel_amount,
      short_over: currentSale.short_over,
      refund: currentSale.refund,
      status: getSaleStatus(currentSale.status),
    },
  })

  useEffect(() => {
    if (isOpen) {
      form.reset({
        date: getLocalDateString(currentSale.date),
        description: currentSale.notes,
        channel: currentSale.channel,
        gross_amount: currentSale.gross_amount,
        discount: currentSale.discount,
        cancel_amount: currentSale.cancel_amount,
        short_over: currentSale.short_over,
        refund: currentSale.refund,
        status: getSaleStatus(currentSale.status),
      })
    }
  }, [isOpen, currentSale, form])

  const mutation = useMutation({
    mutationFn: (data: SaleUpdate) =>
      SalesService.updateSale({
        id: sale.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("Sale updated successfully")
      setIsOpen(false)
      onSuccess?.()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] })
      queryClient.invalidateQueries({ queryKey: ["sale", sale.id] })
      queryClient.invalidateQueries({
        queryKey: ["revenue-channels", companyId],
      })
    },
  })

  const onSubmit = (data: FormData) => {
    const netSales = computeNetSales(
      data.gross_amount,
      data.discount,
      data.cancel_amount,
      data.short_over,
    )

    mutation.mutate({
      date: data.date,
      channel: data.channel.trim(),
      notes: data.description ?? "",
      gross_amount: data.gross_amount,
      discount: data.discount,
      net_sales: netSales,
      cancel_amount: data.cancel_amount,
      short_over: data.short_over,
      refund: data.refund,
      final_amount: computeFinalAmount(netSales, data.refund),
      status: data.status,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => setIsOpen(true)}
        >
          <Pencil />
          Edit Revenue
        </DropdownMenuItem>
      )}
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Revenue</DialogTitle>
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
                          {saleStatuses.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
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

export default EditSale
