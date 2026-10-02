import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { CompaniesService, type CompanyCreate, UsersService } from "@/client"
import CompanyLogoUpload from "@/components/Companies/CompanyLogoUpload"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import useCustomToast from "@/hooks/useCustomToast"
import useSubscription from "@/hooks/useSubscription"
import { PLAN_FEATURE_LIMITS, UPGRADE_PATH } from "@/lib/planLimits"
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

const createCompanySchema = z.object({
  company_name: z.string().min(1),
  currency: z.string().min(1),
  registration_number: z.string().optional(),
  company_email: z.string().email(),
  phone_number: z.string().min(1),
  company_url: z.string().optional(),
  company_address: z.string().optional(),
  // Extended fields
  employee_size: z.string().optional(),
  business_industry: z.string().optional(),
  company_type: z.string().optional(),
  fye_day: z.string().optional(),
  fye_month: z.string().optional(),
  sst_registration_number: z.string().optional(),
  einvoice_required: z.boolean().optional(),
})

const joinCompanySchema = z.object({
  company_id: z.string().uuid({ message: "Valid company UUID is required" }),
})

type CreateCompanyFormData = z.infer<typeof createCompanySchema>
type JoinCompanyFormData = z.infer<typeof joinCompanySchema>

interface AddCompanyProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

export default function AddCompany({
  open,
  onOpenChange,
  children,
}: AddCompanyProps = {}) {
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

  const { showSuccessToast, showErrorToast } = useCustomToast()
  const { subscription } = useSubscription()
  const queryClient = useQueryClient()

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
  })

  const { data: companiesResp } = useQuery({
    queryKey: ["companies"],
    queryFn: () => CompaniesService.readCompanies({ skip: 0, limit: 100 }),
  })

  const currentPlan = subscription?.plan || "personal"
  const rawLimit = PLAN_FEATURE_LIMITS[currentPlan]?.companies
  const limit = typeof rawLimit === "number" ? rawLimit : null
  const currentUsage = companiesResp?.data?.length ?? 0
  const isAtLimit =
    !currentUser?.is_superuser && limit !== null && currentUsage >= limit

  const handleOpenAttempt = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    if (isAtLimit) {
      setUpgradeModalState({
        open: true,
        feature: "companies",
        currentPlan,
        currentUsage,
        limit: limit ?? 2,
        recommendedPlan: UPGRADE_PATH[currentPlan],
      })
    } else {
      setIsOpen(true)
    }
  }

  const createForm = useForm<CreateCompanyFormData>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      company_name: "",
      currency: "",
      registration_number: "",
      company_email: "",
      phone_number: "",
      company_url: "",
      company_address: "",
      employee_size: undefined,
      business_industry: undefined,
      company_type: undefined,
      fye_day: "31",
      fye_month: "12",
      sst_registration_number: "",
      einvoice_required: false,
    },
  })

  const joinForm = useForm<JoinCompanyFormData>({
    resolver: zodResolver(joinCompanySchema),
    defaultValues: {
      company_id: "",
    },
  })

  const [upgradeModalState, setUpgradeModalState] = useState<{
    open: boolean
    feature: string
    currentPlan: string
    currentUsage: number
    limit: number
    recommendedPlan?: string | null
  }>({
    open: false,
    feature: "companies",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 2,
    recommendedPlan: "pro",
  })

  const createMutation = useMutation({
    mutationFn: (data: CompanyCreate) =>
      CompaniesService.createCompany({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Company created")
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["subscription-details"] })
      createForm.reset()
      setIsOpen(false)
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
          feature: errDetail.feature || "companies",
          currentPlan: errDetail.plan || "personal",
          currentUsage: errDetail.current_usage ?? 2,
          limit: errDetail.limit ?? 2,
          recommendedPlan: errDetail.next_plan,
        })
      } else {
        handleError.bind(showErrorToast)(err)
      }
    },
  })

  const joinMutation = useMutation({
    mutationFn: (data: JoinCompanyFormData) =>
      UsersService.updateUserMe({
        requestBody: { company_id: data.company_id },
      }),
    onSuccess: (user) => {
      if (user.company_id) {
        localStorage.setItem("company_id", user.company_id)
      }
      showSuccessToast("Joined company successfully")
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["subscription-details"] })
      joinForm.reset()
      setIsOpen(false)
    },
    onError: handleError.bind(showErrorToast),
  })

  const onCreateSubmit = (data: CreateCompanyFormData) => {
    const { fye_day, fye_month, ...rest } = data
    const financial_year_end =
      fye_day && fye_month ? `${fye_day}-${fye_month}` : undefined
    createMutation.mutate({ ...rest, financial_year_end })
  }

  const onJoinSubmit = (data: JoinCompanyFormData) => {
    joinMutation.mutate(data)
  }

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(val) => {
          if (val) {
            handleOpenAttempt()
          } else {
            setIsOpen(false)
          }
        }}
      >
        {children ? (
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpenAttempt}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleOpenAttempt()
              }
            }}
            className="inline-block cursor-pointer"
          >
            {children}
          </div>
        ) : !isControlled ? (
          <Button
            className="h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4 cursor-pointer"
            aria-label="Add Company"
            title="Add Company"
            onClick={handleOpenAttempt}
          >
            <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Company</span>
          </Button>
        ) : null}
        <DialogContent className="max-w-full sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
            <DialogDescription>
              Create a new company or join an existing one
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="join">Join</TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <Form {...createForm}>
                <form
                  onSubmit={createForm.handleSubmit(onCreateSubmit)}
                  className="flex flex-col max-h-[65vh]"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 px-1">
                    {/* Company Name */}
                    <FormField
                      control={createForm.control}
                      name="company_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Company Name{" "}
                            <span className="text-destructive">*</span>
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
                      control={createForm.control}
                      name="registration_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registration Number</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 202301012345" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Company Email */}
                    <FormField
                      control={createForm.control}
                      name="company_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Company Email{" "}
                            <span className="text-destructive">*</span>
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
                      control={createForm.control}
                      name="phone_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Phone Number{" "}
                            <span className="text-destructive">*</span>
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
                      control={createForm.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Currency <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. MYR" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Company Type */}
                    <FormField
                      control={createForm.control}
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
                      control={createForm.control}
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
                      control={createForm.control}
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

                    {/* Financial Year End — two selects in one cell */}
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Financial Year End</FormLabel>
                      <div className="flex gap-2">
                        <FormField
                          control={createForm.control}
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
                          control={createForm.control}
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
                      control={createForm.control}
                      name="sst_registration_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SST Registration Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. W10-1234-12345678"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* e-Invoice Required */}
                    <FormField
                      control={createForm.control}
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
                      control={createForm.control}
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
                      control={createForm.control}
                      name="company_url"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormControl>
                            <CompanyLogoUpload
                              currentUrl={field.value}
                              onUploadComplete={(url) => field.onChange(url)}
                              disabled={createMutation.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter className="pt-4 border-t shrink-0">
                    <DialogClose asChild>
                      <Button
                        variant="outline"
                        disabled={createMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    <LoadingButton
                      type="submit"
                      loading={createMutation.isPending}
                    >
                      Create
                    </LoadingButton>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="join">
              <Form {...joinForm}>
                <form
                  onSubmit={joinForm.handleSubmit(onJoinSubmit)}
                  className="flex flex-col max-h-[55vh]"
                >
                  <div className="grid gap-4 py-4 overflow-y-auto flex-1 px-1">
                    <FormField
                      control={joinForm.control}
                      name="company_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company ID</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter company ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter className="pt-4 border-t shrink-0">
                    <DialogClose asChild>
                      <Button
                        variant="outline"
                        disabled={joinMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                    <LoadingButton
                      type="submit"
                      loading={joinMutation.isPending}
                    >
                      Join
                    </LoadingButton>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <UpgradeModal
        open={upgradeModalState.open}
        onClose={() =>
          setUpgradeModalState((prev) => ({ ...prev, open: false }))
        }
        feature={upgradeModalState.feature}
        currentPlan={upgradeModalState.currentPlan}
        currentUsage={upgradeModalState.currentUsage}
        limit={upgradeModalState.limit}
        recommendedPlan={upgradeModalState.recommendedPlan}
      />
    </>
  )
}
