import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react-motion"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { type ProductCreate, ProductsService } from "@/client"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
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

const numericField = z.union([z.string(), z.number()]).pipe(z.coerce.number())

const unitTypes = [
  "pcs",
  "kg",
  "box",
  "pack",
  "l",
  "ml",
  "m",
  "ft",
  "set",
  "pair",
] as const

const formSchema = z.object({
  product_name: z.string().min(1, { message: "Product name is required" }),
  description: z.string().optional(),
  sku: z.string().optional(),
  category: z.string().optional(),
  cost_price: numericField.pipe(z.number().min(0)),
  sell_price: numericField.pipe(z.number().min(0)),
  supplier: z.string().optional(),
  stock_quantity: numericField.pipe(z.number().min(0)),
  unit_type: z.enum(unitTypes),
})

type FormInput = z.input<typeof formSchema>
type FormData = z.output<typeof formSchema>

const AddProduct = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const companyId = localStorage.getItem("company_id")

  const [upgradeModalState, setUpgradeModalState] = useState<{
    open: boolean
    feature: string
    currentPlan: string
    currentUsage: number
    limit: number
    recommendedPlan?: string | null
  }>({
    open: false,
    feature: "products",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 50,
    recommendedPlan: "pro",
  })

  const { data: categoriesData } = useQuery({
    queryKey: ["product-categories", companyId],
    queryFn: () => ProductsService.readProductCategories({ companyId }),
    enabled: !!companyId,
    staleTime: 1000 * 60 * 5,
  })
  const productCategories = categoriesData?.data ?? []

  const form = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      product_name: "",
      description: "",
      sku: "",
      category: "",
      cost_price: 0,
      sell_price: 0,
      supplier: "",
      stock_quantity: 0,
      unit_type: "pcs",
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: ProductCreate) => {
      return await ProductsService.createProduct({ requestBody: data })
    },
    onSuccess: () => {
      showSuccessToast("Product created successfully")
      form.reset()
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
          feature: errDetail.feature || "products",
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
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({
        queryKey: ["product-categories", companyId],
      })
    },
  })

  const onSubmit = (data: FormData) => {
    const payload: ProductCreate = {
      product_name: data.product_name,
      description: data.description || undefined,
      sku: data.sku || undefined,
      category: data.category || undefined,
      cost_price: Number(data.cost_price),
      sell_price: Number(data.sell_price),
      supplier: data.supplier || undefined,
      stock_quantity: Number(data.stock_quantity),
      unit_type: data.unit_type,
      company_id: companyId,
    }
    mutation.mutate(payload)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            className="my-4 h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4"
            aria-label="Add Product"
            title="Add Product"
          >
            <Plus className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Product</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-full sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Fill in the product details.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col max-h-[75vh]"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 px-1">
                <FormField
                  control={form.control}
                  name="product_name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Product Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Product name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Product Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional product description"
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU / Code</FormLabel>
                      <FormControl>
                        <Input placeholder="SKU-001" {...field} />
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
                        <AutocompleteInput
                          suggestions={productCategories}
                          placeholder="Category"
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
                  name="supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier</FormLabel>
                      <FormControl>
                        <Input placeholder="Supplier name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cost_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sell_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sell Price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stock_quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Type</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {unitTypes.map((unit) => (
                              <SelectItem key={unit} value={unit}>
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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

export default AddProduct
