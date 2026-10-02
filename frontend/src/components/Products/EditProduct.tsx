import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react-motion"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  type ProductPublic,
  ProductsService,
  type ProductUpdate,
} from "@/client"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import { Button } from "@/components/ui/button"
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

function getUnitType(unit: string | undefined) {
  return unit && unitTypes.includes(unit as (typeof unitTypes)[number])
    ? (unit as (typeof unitTypes)[number])
    : "pcs"
}

interface EditProductProps {
  product: ProductPublic
  onSuccess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}

const EditProduct = ({
  product,
  onSuccess,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger,
}: EditProductProps) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen
  const setIsOpen = (value: boolean) => {
    if (isControlled) {
      setControlledOpen?.(value)
    } else {
      setInternalOpen(value)
    }
  }

  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const companyId = localStorage.getItem("company_id")

  const { data: latestProduct } = useQuery({
    queryKey: ["product", product.id],
    queryFn: () => ProductsService.readProduct({ id: product.id }),
    enabled: isOpen,
    initialData: product,
  })

  const currentProduct = latestProduct ?? product

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
      product_name: currentProduct.product_name,
      description: currentProduct.description ?? "",
      sku: currentProduct.sku ?? "",
      category: currentProduct.category ?? "",
      cost_price: currentProduct.cost_price,
      sell_price: currentProduct.sell_price,
      supplier: currentProduct.supplier ?? "",
      stock_quantity: currentProduct.stock_quantity,
      unit_type: getUnitType(currentProduct.unit_type),
    },
  })

  useEffect(() => {
    if (isOpen) {
      form.reset({
        product_name: currentProduct.product_name,
        description: currentProduct.description ?? "",
        sku: currentProduct.sku ?? "",
        category: currentProduct.category ?? "",
        cost_price: currentProduct.cost_price,
        sell_price: currentProduct.sell_price,
        supplier: currentProduct.supplier ?? "",
        stock_quantity: currentProduct.stock_quantity,
        unit_type: getUnitType(currentProduct.unit_type),
      })
    }
  }, [isOpen, currentProduct, form])

  const mutation = useMutation({
    mutationFn: (data: ProductUpdate) =>
      ProductsService.updateProduct({
        id: product.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("Product updated successfully")
      setIsOpen(false)
      onSuccess?.()
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["product", product.id] })
      queryClient.invalidateQueries({
        queryKey: ["product-categories", companyId],
      })
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate({
      product_name: data.product_name,
      description: data.description || undefined,
      sku: data.sku || undefined,
      category: data.category || undefined,
      cost_price: data.cost_price,
      sell_price: data.sell_price,
      supplier: data.supplier || undefined,
      stock_quantity: data.stock_quantity,
      unit_type: data.unit_type,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        trigger
      ) : !isControlled ? (
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => setIsOpen(true)}
        >
          <Pencil />
          Edit Product
        </DropdownMenuItem>
      ) : null}
      <DialogContent className="max-w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
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
  )
}

export default EditProduct
