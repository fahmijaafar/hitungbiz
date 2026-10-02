import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react-motion"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  CompaniesService,
  type CompanyPublic,
  type CompanyUpdate,
} from "@/client"
import CompanyLogoUpload from "@/components/Companies/CompanyLogoUpload"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import useCustomToast from "@/hooks/useCustomToast"
import { setAppCurrency } from "@/lib/currency"
import { handleError } from "@/utils"

const EMPLOYEE_SIZE_OPTIONS = [
  "1",
  "2-10",
  "11-50",
  "51-100",
  "101-1000",
  "1001-10000",
  "10000+",
]

const BUSINESS_INDUSTRY_OPTIONS = [
  "Agriculture & Forestry",
  "Automotive",
  "Construction & Real Estate",
  "Consulting & Professional Services",
  "Education",
  "Energy & Utilities",
  "Financial Services",
  "Food & Beverages",
  "Healthcare & Medical",
  "Hospitality & Tourism",
  "Information Technology",
  "Legal Services",
  "Logistics & Transportation",
  "Manufacturing",
  "Media & Entertainment",
  "Mining & Resources",
  "Non-Profit & NGO",
  "Retail & E-Commerce",
  "Telecommunications",
  "Others",
]

const COMPANY_TYPE_OPTIONS = [
  "Sole Proprietorship",
  "Sdn Bhd (Private Limited)",
  "Bhd (Public Limited)",
  "LLP (Limited Liability Partnership)",
  "Partnership",
  "Enterprise",
  "Others",
]

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const day = String(i + 1).padStart(2, "0")
  return { value: day, label: String(i + 1) }
})

/** Parse "DD-MM" → { day, month } */
function parseFYE(fye: string | null | undefined): {
  day: string
  month: string
} {
  if (!fye) return { day: "31", month: "12" }
  const parts = fye.split("-")
  if (parts.length === 2) return { day: parts[0], month: parts[1] }
  return { day: "31", month: "12" }
}

const numericField = z.union([z.string(), z.number()]).pipe(z.coerce.number())

const formSchema = z.object({
  company_name: z.string().min(1),
  currency: z.string().min(1),
  registration_number: z.string().optional(),
  company_email: z.string().email(),
  phone_number: z.string().min(1),
  company_url: z.string().optional(),
  company_address: z.string().optional(),
  quotation_running_number: numericField.pipe(z.number().int().min(1)),
  invoice_running_number: numericField.pipe(z.number().int().min(1)),
  payment_voucher_running_number: numericField.pipe(z.number().int().min(1)),
  delivery_order_running_number: numericField.pipe(z.number().int().min(1)),
  // Extended fields
  employee_size: z.string().optional(),
  business_industry: z.string().optional(),
  company_type: z.string().optional(),
  fye_day: z.string().optional(),
  fye_month: z.string().optional(),
  sst_registration_number: z.string().optional(),
  einvoice_required: z.boolean().optional(),
})

type FormInput = z.input<typeof formSchema>
type FormData = z.output<typeof formSchema>

export default function EditCompany({
  company: initialCompany,
  onSuccess,
}: {
  company: CompanyPublic
  onSuccess?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const queryClient = useQueryClient()

  const { data: companyData } = useQuery({
    queryKey: ["company", initialCompany.id],
    queryFn: () => CompaniesService.readCompany({ id: initialCompany.id }),
    enabled: isOpen,
    initialData: initialCompany,
  })

  const company = companyData ?? initialCompany
  const fye = parseFYE(company.financial_year_end)

  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_name: company.company_name ?? "",
      currency: company.currency ?? "MYR",
      registration_number: company.registration_number ?? "",
      company_email: company.company_email ?? "",
      phone_number: company.phone_number ?? "",
      company_url: company.company_url ?? "",
      company_address: company.company_address ?? "",
      quotation_running_number:
        company.document_running_numbers?.quotation ?? 1,
      invoice_running_number: company.document_running_numbers?.invoice ?? 1,
      payment_voucher_running_number:
        company.document_running_numbers?.paymentvoucher ?? 1,
      delivery_order_running_number:
        company.document_running_numbers?.deliveryorder ?? 1,
      // Extended fields
      employee_size: company.employee_size ?? undefined,
      business_industry: company.business_industry ?? undefined,
      company_type: company.company_type ?? undefined,
      fye_day: fye.day,
      fye_month: fye.month,
      sst_registration_number: company.sst_registration_number ?? "",
      einvoice_required: company.einvoice_required ?? false,
    },
  })

  useEffect(() => {
    if (isOpen) {
      form.reset({
        company_name: company.company_name ?? "",
        currency: company.currency ?? "MYR",
        registration_number: company.registration_number ?? "",
        company_email: company.company_email ?? "",
        phone_number: company.phone_number ?? "",
        company_url: company.company_url ?? "",
        company_address: company.company_address ?? "",
        quotation_running_number:
          company.document_running_numbers?.quotation ?? 1,
        invoice_running_number: company.document_running_numbers?.invoice ?? 1,
        payment_voucher_running_number:
          company.document_running_numbers?.paymentvoucher ?? 1,
        delivery_order_running_number:
          company.document_running_numbers?.deliveryorder ?? 1,
        employee_size: company.employee_size ?? undefined,
        business_industry: company.business_industry ?? undefined,
        company_type: company.company_type ?? undefined,
        fye_day: fye.day,
        fye_month: fye.month,
        sst_registration_number: company.sst_registration_number ?? "",
        einvoice_required: company.einvoice_required ?? false,
      })
    }
  }, [isOpen, company, fye.day, fye.month, form])

  const mutation = useMutation({
    mutationFn: (data: CompanyUpdate) =>
      CompaniesService.updateCompany({
        id: company.id,
        requestBody: data,
      }),
    onSuccess: (data) => {
      showSuccessToast("Company updated")
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["company"] })
      queryClient.invalidateQueries({ queryKey: ["companyName"] })
      queryClient.invalidateQueries({ queryKey: ["documents"] })
      queryClient.invalidateQueries({ queryKey: ["sales"] })
      if (data?.currency) setAppCurrency(data.currency)
      setIsOpen(false)
      onSuccess?.()
    },
    onError: handleError.bind(showErrorToast),
  })

  const onSubmit = (data: FormData) => {
    const { fye_day, fye_month, ...rest } = data
    const financial_year_end =
      fye_day && fye_month ? `${fye_day}-${fye_month}` : undefined
    mutation.mutate({
      company_name: rest.company_name,
      currency: rest.currency,
      registration_number: rest.registration_number || null,
      company_email: rest.company_email,
      phone_number: rest.phone_number,
      company_url: rest.company_url,
      company_address: rest.company_address,
      document_running_numbers: {
        quotation: rest.quotation_running_number,
        invoice: rest.invoice_running_number,
        paymentvoucher: rest.payment_voucher_running_number,
        deliveryorder: rest.delivery_order_running_number,
      },
      employee_size: rest.employee_size || null,
      business_industry: rest.business_industry || null,
      company_type: rest.company_type || null,
      financial_year_end: financial_year_end ?? null,
      sst_registration_number: rest.sst_registration_number || null,
      einvoice_required: rest.einvoice_required ?? false,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <span className="sr-only">Edit company</span>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Company</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col max-h-[75vh]"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 px-1">
              {/* Company Name */}
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Company Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Registration Number */}
              <FormField
                control={form.control}
                name="registration_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Company Email */}
              <FormField
                control={form.control}
                name="company_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Company Email <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone Number */}
              <FormField
                control={form.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Phone Number <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Currency */}
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Currency <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Company Type */}
              <FormField
                control={form.control}
                name="company_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select company type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COMPANY_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Business Industry */}
              <FormField
                control={form.control}
                name="business_industry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Industry</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BUSINESS_INDUSTRY_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Employee Size */}
              <FormField
                control={form.control}
                name="employee_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee Size</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select employee count" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EMPLOYEE_SIZE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Financial Year End */}
              <FormItem className="sm:col-span-2">
                <FormLabel>Financial Year End</FormLabel>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="fye_day"
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? "31"}
                      >
                        <FormControl>
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="Day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DAY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fye_month"
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? "12"}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MONTH_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </FormItem>

              {/* SST Registration Number */}
              <FormField
                control={form.control}
                name="sst_registration_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SST Registration Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. W10-1234-12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* e-Invoice Required */}
              <FormField
                control={form.control}
                name="einvoice_required"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 h-fit self-end">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>e-Invoice Required</FormLabel>
                    </div>
                  </FormItem>
                )}
              />

              {/* Company Address — full width */}
              <FormField
                control={form.control}
                name="company_address"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Company logo upload — full width */}
              <FormField
                control={form.control}
                name="company_url"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormControl>
                      <CompanyLogoUpload
                        currentUrl={field.value}
                        onUploadComplete={(url) => field.onChange(url)}
                        disabled={mutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Document Running Numbers — full width */}
              <div className="sm:col-span-2 rounded-md border p-4">
                <h3 className="font-medium text-sm">
                  Document Running Numbers
                </h3>
                <p className="mt-1 text-muted-foreground text-sm">
                  These values are used for the next generated document number.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField
                    control={form.control}
                    name="quotation_running_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quotation</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" step="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="invoice_running_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" step="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="payment_voucher_running_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Voucher</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" step="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="delivery_order_running_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delivery Order</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" step="1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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
