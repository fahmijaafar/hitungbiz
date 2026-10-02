import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { CompaniesService, type CompanyCreate, UsersService } from "@/client"
import { AuthLayout } from "@/components/Common/AuthLayout"
import { DateInput } from "@/components/ui/date-input"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

const basicInfoSchema = z.object({
  birthdate: z.string().min(1, { message: "Birthdate is required" }),
  phone_number: z.string().min(1, { message: "Phone number is required" }),
})

const createCompanySchema = z.object({
  company_name: z.string().min(1, { message: "Company name is required" }),
  currency: z.string().min(1, { message: "Currency is required" }),
  registration_number: z.string().optional(),
  company_email: z.string().email({ message: "Valid email is required" }),
  phone_number: z.string().min(1, { message: "Phone number is required" }),
  company_url: z.string().optional(),
  company_address: z.string().optional(),
})

const joinCompanySchema = z.object({
  company_id: z.string().uuid({ message: "Valid company ID is required" }),
})

type BasicInfoFormData = z.infer<typeof basicInfoSchema>
type CreateCompanyFormData = z.infer<typeof createCompanySchema>
type JoinCompanyFormData = z.infer<typeof joinCompanySchema>

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }

    const user = await UsersService.readUserMe()

    // Unverified users must verify email before onboarding
    if (!user.email_verified) {
      throw redirect({
        to: "/email-verification-required",
      })
    }

    if (user.company_id) {
      localStorage.setItem("company_id", user.company_id)
      if (user.role) {
        localStorage.setItem("role", user.role)
      }
      throw redirect({
        to: "/",
      })
    }
  },
})

function Onboarding() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [basicInfoSaved, setBasicInfoSaved] = useState(false)

  // Basic info form
  const basicInfoForm = useForm<BasicInfoFormData>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      birthdate: "",
      phone_number: "",
    },
  })

  // Reset saved state when form values change
  useEffect(() => {
    const subscription = basicInfoForm.watch(() => {
      setBasicInfoSaved(false)
    })
    return () => subscription.unsubscribe()
  }, [basicInfoForm])

  // Create company form
  const createCompanyForm = useForm<CreateCompanyFormData>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      company_name: "",
      currency: "RM",
      registration_number: "",
      company_email: "",
      phone_number: "",
      company_url: "",
      company_address: "",
    },
  })

  // Join company form
  const joinCompanyForm = useForm<JoinCompanyFormData>({
    resolver: zodResolver(joinCompanySchema),
    defaultValues: {
      company_id: "",
    },
  })

  // Update basic info mutation
  const updateBasicInfoMutation = useMutation({
    mutationFn: (data: BasicInfoFormData) =>
      UsersService.updateUserMe({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("Basic information updated")
      setBasicInfoSaved(true)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
    onError: handleError.bind(showErrorToast),
  })

  // Create company mutation
  const createCompanyMutation = useMutation({
    mutationFn: (data: CompanyCreate) =>
      CompaniesService.createCompany({ requestBody: data }),
    onSuccess: async (company) => {
      showSuccessToast("Company created")
      // Update user with company_id
      await UsersService.updateUserMe({
        requestBody: { company_id: company.id },
      })
      localStorage.setItem("company_id", company.id)
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["subscription-details"] })
      navigate({ to: "/" })
    },
    onError: handleError.bind(showErrorToast),
  })

  // Join company mutation
  const joinCompanyMutation = useMutation({
    mutationFn: (data: JoinCompanyFormData) =>
      UsersService.updateUserMe({
        requestBody: { company_id: data.company_id },
      }),
    onSuccess: async (user) => {
      if (user.company_id) {
        localStorage.setItem("company_id", user.company_id)
      }
      showSuccessToast("Joined company successfully")
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      queryClient.invalidateQueries({ queryKey: ["subscription-details"] })
      navigate({ to: "/" })
    },
    onError: handleError.bind(showErrorToast),
  })

  const onBasicInfoSubmit = (data: BasicInfoFormData) => {
    if (updateBasicInfoMutation.isPending) return
    updateBasicInfoMutation.mutate(data)
  }

  const onCreateCompanySubmit = (data: CreateCompanyFormData) => {
    if (createCompanyMutation.isPending) return
    createCompanyMutation.mutate(data)
  }

  const onJoinCompanySubmit = (data: JoinCompanyFormData) => {
    if (joinCompanyMutation.isPending) return
    joinCompanyMutation.mutate(data)
  }

  return (
    <AuthLayout>
      <div className="flex flex-col gap-8 w-full max-w-md">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-bold">Welcome! Let's get started</h1>
          <p className="text-muted-foreground text-sm">
            Complete your profile and set up your company
          </p>
        </div>

        {/* Section 1: Basic Information */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Basic Information</h2>
          <Form {...basicInfoForm}>
            <form
              onSubmit={basicInfoForm.handleSubmit(onBasicInfoSubmit)}
              className="space-y-4"
            >
              <FormField
                control={basicInfoForm.control}
                name="birthdate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birthdate</FormLabel>
                    <FormControl>
                      <DateInput {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={basicInfoForm.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+1234567890" {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <LoadingButton
                type="submit"
                className="w-full"
                loading={updateBasicInfoMutation.isPending}
                disabled={basicInfoSaved || updateBasicInfoMutation.isPending}
              >
                {basicInfoSaved ? "Saved" : "Save Basic Info"}
              </LoadingButton>
            </form>
          </Form>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Next Step
            </span>
          </div>
        </div>

        {/* Section 2: Company Information */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Company Information</h2>

          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create Company</TabsTrigger>
              <TabsTrigger value="join">Join Company</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-4 mt-4">
              <Form {...createCompanyForm}>
                <form
                  onSubmit={createCompanyForm.handleSubmit(
                    onCreateCompanySubmit,
                  )}
                  className="space-y-4"
                >
                  <FormField
                    control={createCompanyForm.control}
                    name="company_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Recce Solutions Pte Ltd"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createCompanyForm.control}
                    name="registration_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Registration number" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createCompanyForm.control}
                    name="company_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="contact@sugarybysr.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createCompanyForm.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="+1234567890"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createCompanyForm.control}
                    name="company_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main St" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createCompanyForm.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <FormControl>
                          <Input placeholder="RM" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <LoadingButton
                    type="submit"
                    className="w-full"
                    loading={createCompanyMutation.isPending}
                  >
                    Create Company & Finish
                  </LoadingButton>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="join" className="space-y-4 mt-4">
              <Form {...joinCompanyForm}>
                <form
                  onSubmit={joinCompanyForm.handleSubmit(onJoinCompanySubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={joinCompanyForm.control}
                    name="company_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter company ID" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <LoadingButton
                    type="submit"
                    className="w-full"
                    loading={joinCompanyMutation.isPending}
                  >
                    Join Company & Finish
                  </LoadingButton>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Onboarding
