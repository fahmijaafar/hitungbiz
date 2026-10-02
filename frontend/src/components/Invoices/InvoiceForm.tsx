import { useQuery } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react-motion"
import type { FormEvent } from "react"
import { useEffect, useMemo, useState } from "react"

import {
  ClientsService,
  CompaniesService,
  type CompanyPublic,
  type DocumentCreate,
  type DocumentPublic,
  type DocumentUpdate,
  type ProductPublic,
  ProductsService,
  UsersService,
} from "@/client"
import AddClient from "@/components/Clients/AddClient"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DateInput } from "@/components/ui/date-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency } from "@/lib/currency"

const invoiceStatuses = [
  "Draft",
  "New",
  "Pending",
  "Overdue",
  "Paid",
  "Canceled",
  "Expired",
] as const

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

type ClientDetails = {
  name: string
  company_name: string
  email: string
  phone_number: string
}

export type InvoiceLineItem = {
  title: string
  description?: string | null
  unit_price: number
  quantity: number
  unit_type: string
  taxable: boolean
  total: number
  product_id?: string | null
}

type Totals = {
  subtotal: number
  discount: number
  taxable_subtotal: number
  tax_percentage: number
  tax_total: number
  shipping: number
  final_total: number
  client_details: ClientDetails
}

export type InvoiceFormPayload = DocumentCreate | DocumentUpdate
export type InvoiceFormSubmitOptions = {
  saveAsRevenue: boolean
}

type InvoiceFormProps = {
  invoice?: DocumentPublic
  mode?: "create" | "edit" | "view"
  onSubmit?: (
    payload: InvoiceFormPayload,
    nextRunningNumbers?: Record<string, number>,
    options?: InvoiceFormSubmitOptions,
  ) => void
  isPending?: boolean
}

const today = new Date().toISOString().slice(0, 10)

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getLineItems(invoice?: DocumentPublic): InvoiceLineItem[] {
  if (!Array.isArray(invoice?.item)) {
    return [createEmptyLineItem()]
  }

  const items = invoice.item as Array<Record<string, unknown>>
  if (items.length === 0) {
    return [createEmptyLineItem()]
  }

  return items.map((item) => ({
    title: String(item.title ?? ""),
    description: typeof item.description === "string" ? item.description : null,
    unit_price: asNumber(item.unit_price),
    quantity: asNumber(item.quantity, 1),
    unit_type: String(item.unit_type ?? "pcs"),
    taxable: Boolean(item.taxable),
    total: asNumber(item.total),
    product_id: typeof item.product_id === "string" ? item.product_id : null,
  }))
}

function createEmptyLineItem(): InvoiceLineItem {
  return {
    title: "",
    description: null,
    unit_price: 0,
    quantity: 1,
    unit_type: "pcs",
    taxable: false,
    total: 0,
    product_id: null,
  }
}

function formatDocNo(company?: CompanyPublic) {
  const runningNumber = company?.document_running_numbers?.invoice ?? 1
  return `INV${String(runningNumber).padStart(5, "0")}`
}

function getClientSnapshot(invoice?: DocumentPublic): ClientDetails {
  const calculation = asRecord(invoice?.price_calculation)
  const client = asRecord(calculation.client_details)
  return {
    name: String(client.name ?? ""),
    company_name: String(client.company_name ?? ""),
    email: String(client.email ?? ""),
    phone_number: String(client.phone_number ?? ""),
  }
}

export function InvoiceForm({
  invoice,
  mode = "create",
  onSubmit,
  isPending = false,
}: InvoiceFormProps) {
  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => UsersService.readUserMe(),
  })

  const storedCompanyId =
    typeof window !== "undefined" ? localStorage.getItem("company_id") : null
  const companyId =
    storedCompanyId &&
    storedCompanyId !== "undefined" &&
    storedCompanyId !== "null" &&
    storedCompanyId !== ""
      ? storedCompanyId
      : (currentUser?.company_id ?? null)

  const readOnly = mode === "view"

  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      if (!companyId) return undefined
      try {
        return await CompaniesService.readCompany({ id: companyId })
      } catch {
        return undefined
      }
    },
    enabled: !!companyId,
    retry: false,
  })

  const { data: clients } = useQuery({
    queryKey: ["clients", companyId],
    queryFn: async () => {
      if (!companyId) return { data: [], count: 0 }
      try {
        return await ClientsService.readClients({
          skip: 0,
          limit: 100,
          companyId,
        })
      } catch {
        return { data: [], count: 0 }
      }
    },
    enabled: !!companyId,
    retry: false,
  })

  const { data: products } = useQuery({
    queryKey: ["products", companyId],
    queryFn: async () => {
      if (!companyId) return { data: [], count: 0 }
      try {
        return await ProductsService.readProducts({
          skip: 0,
          limit: 100,
          companyId,
        })
      } catch {
        return { data: [], count: 0 }
      }
    },
    enabled: !!companyId,
    retry: false,
  })

  const initialCalculation = asRecord(invoice?.price_calculation)
  const [date, setDate] = useState(invoice?.date ?? today)
  const [title, setTitle] = useState(invoice?.title ?? "")
  const [status, setStatus] = useState(invoice?.status ?? "Draft")
  const [saveAsRevenue, setSaveAsRevenue] = useState(false)
  const [clientId, setClientId] = useState(invoice?.client_id ?? "manual")
  const [clientDetails, setClientDetails] = useState<ClientDetails>(
    getClientSnapshot(invoice),
  )
  const [items, setItems] = useState<InvoiceLineItem[]>(getLineItems(invoice))
  const [remark, setRemark] = useState(invoice?.remark ?? "")
  const [discount, setDiscount] = useState(
    asNumber(initialCalculation.discount),
  )
  const [taxPercentage, setTaxPercentage] = useState(
    asNumber(initialCalculation.tax_percentage),
  )
  const [shipping, setShipping] = useState(
    asNumber(initialCalculation.shipping),
  )

  const selectedClient = clients?.data.find((client) => client.id === clientId)

  useEffect(() => {
    if (!selectedClient) return
    setClientDetails({
      name: selectedClient.name ?? "",
      company_name: selectedClient.company_name ?? "",
      email: selectedClient.email ?? "",
      phone_number: selectedClient.phone_number ?? "",
    })
  }, [selectedClient])

  const docno =
    mode === "create" ? formatDocNo(company) : (invoice?.docno ?? "")

  const canSaveAsRevenue =
    status === "Paid" && (mode === "create" || invoice?.status !== "Paid")

  useEffect(() => {
    if (canSaveAsRevenue) return
    setSaveAsRevenue(false)
  }, [canSaveAsRevenue])

  const calculatedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        total: asNumber(item.unit_price) * asNumber(item.quantity),
      })),
    [items],
  )

  const totals: Totals = useMemo(() => {
    const subtotal = calculatedItems.reduce((sum, item) => sum + item.total, 0)
    const taxableSubtotal = calculatedItems
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + item.total, 0)
    const taxTotal = taxableSubtotal * (taxPercentage / 100)
    const finalTotal = subtotal - discount + taxTotal + shipping

    return {
      subtotal,
      discount,
      taxable_subtotal: taxableSubtotal,
      tax_percentage: taxPercentage,
      tax_total: taxTotal,
      shipping,
      final_total: finalTotal,
      client_details: clientDetails,
    }
  }, [calculatedItems, clientDetails, discount, shipping, taxPercentage])

  const updateItem = (index: number, patch: Partial<InvoiceLineItem>) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    )
  }

  const chooseProduct = (index: number, productId: string) => {
    const product = products?.data.find((item) => item.id === productId)
    if (!product) return
    const titleParts = [product.product_name]
    if (product.description) titleParts.push(product.description)
    updateItem(index, {
      product_id: product.id,
      title: titleParts.join("\n"),
      description: product.description ?? null,
      unit_type: product.unit_type ?? "pcs",
      unit_price: product.sell_price ?? 0,
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onSubmit || readOnly) return

    const doctype = "invoice"

    const payload: InvoiceFormPayload = {
      company_id: companyId,
      docno,
      doctype,
      client_id: clientId === "manual" ? null : clientId,
      date,
      title,
      item: calculatedItems,
      price_calculation: totals,
      remark,
      status,
    }

    const nextRunningNumbers =
      mode === "create"
        ? {
            ...(company?.document_running_numbers ?? {}),
            [doctype]: (company?.document_running_numbers?.[doctype] ?? 1) + 1,
          }
        : undefined

    onSubmit(payload, nextRunningNumbers, {
      saveAsRevenue: canSaveAsRevenue && saveAsRevenue,
    })
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Date</Label>
          <DateInput
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label>Invoice No</Label>
          <Input value={docno} disabled className="bg-muted" />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value)}
            disabled={readOnly}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {invoiceStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={readOnly}
          required
        />
      </div>

      <section className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <Label>Client</Label>
          <Select
            value={clientId}
            onValueChange={setClientId}
            disabled={readOnly}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select client or enter manually" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual client details</SelectItem>
              {clients?.data.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AddClient
          companyId={companyId}
          onSuccess={(newClient) => {
            setClientId(newClient.id)
            setClientDetails({
              name: newClient.name ?? "",
              company_name: newClient.company_name ?? "",
              email: newClient.email ?? "",
              phone_number: newClient.phone_number ?? "",
            })
          }}
          trigger={
            <Button
              variant="outline"
              type="button"
              className="self-end"
              disabled={readOnly}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add New Client
            </Button>
          }
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Client Name</Label>
          <Input
            value={clientDetails.name}
            onChange={(event) =>
              setClientDetails((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label>Client Phone</Label>
          <Input
            value={clientDetails.phone_number}
            onChange={(event) =>
              setClientDetails((current) => ({
                ...current,
                phone_number: event.target.value,
              }))
            }
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label>Client Email</Label>
          <Input
            type="email"
            value={clientDetails.email}
            onChange={(event) =>
              setClientDetails((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            disabled={readOnly}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-md border">
        <div className="hidden grid-cols-[minmax(260px,1fr)_170px_170px_140px] bg-muted/70 text-sm font-semibold md:grid">
          <div className="flex items-center gap-3 border-r p-3">
            <span>Line Items</span>
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setItems((current) => [...current, createEmptyLineItem()])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Item
              </Button>
            )}
          </div>
          <div className="border-r p-3 text-center">Unit Price</div>
          <div className="border-r p-3 text-center">Quantity</div>
          <div className="p-3 text-right">Total</div>
        </div>

        <div className="flex items-center justify-between gap-3 bg-muted/70 p-3 text-sm font-semibold md:hidden">
          <span>Line Items</span>
          {!readOnly && (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setItems((current) => [...current, createEmptyLineItem()])
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Item
            </Button>
          )}
        </div>

        {calculatedItems.map((item, index) => (
          <div
            className="grid gap-3 border-t p-3 md:grid-cols-[minmax(260px,1fr)_170px_170px_140px] md:gap-0 md:p-0"
            key={index}
          >
            <div className="space-y-2 md:border-r md:p-3">
              <Label className="md:hidden">Line Item</Label>
              <Textarea
                value={item.title}
                onChange={(event) => {
                  const newTitle = event.target.value
                  const titleLines = newTitle.split("\n")
                  const newDescription =
                    titleLines.length > 1
                      ? titleLines.slice(1).join("\n")
                      : null
                  updateItem(index, {
                    title: newTitle,
                    description: newDescription,
                    product_id: null,
                  })
                }}
                disabled={readOnly}
                placeholder="Item description"
              />
              {!readOnly && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Select
                    value={item.product_id ?? ""}
                    onValueChange={(value) => chooseProduct(index, value)}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-48">
                      <SelectValue placeholder="Choose from list" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.data.map((product: ProductPublic) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.product_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setItems((current) =>
                        current.length === 1
                          ? [createEmptyLineItem()]
                          : current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                      )
                    }
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Remove Item
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-3 md:border-r md:p-3">
              <Label className="md:hidden">Unit Price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={item.unit_price}
                onChange={(event) =>
                  updateItem(index, {
                    unit_price: asNumber(event.target.value),
                  })
                }
                disabled={readOnly}
              />
              <div className="flex items-center justify-center gap-2 text-sm">
                <Checkbox
                  checked={item.taxable}
                  onCheckedChange={(checked) =>
                    updateItem(index, { taxable: checked === true })
                  }
                  disabled={readOnly}
                />
                <span>Tax</span>
              </div>
            </div>
            <div className="space-y-3 md:border-r md:p-3">
              <Label className="md:hidden">Quantity</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={item.quantity}
                onChange={(event) =>
                  updateItem(index, { quantity: asNumber(event.target.value) })
                }
                disabled={readOnly}
              />
              <Select
                value={item.unit_type}
                onValueChange={(value) =>
                  updateItem(index, { unit_type: value })
                }
                disabled={readOnly}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitTypes.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/50 p-3 font-semibold md:block md:rounded-none md:bg-transparent md:text-right">
              <span className="md:hidden">Total</span>
              <span>{formatCurrency(item.total)}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_380px]">
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <Label>Remark / Notes</Label>
          {readOnly ? (
            <div className="min-h-36 rounded-md border bg-background px-3 py-2 text-sm whitespace-pre-wrap">
              {remark || "-"}
            </div>
          ) : (
            <Textarea
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              className="min-h-36 bg-background"
            />
          )}
        </div>
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-2 border-b">
            <div className="border-r p-3 text-right">Subtotal</div>
            <div className="p-3 text-right font-semibold">
              {formatCurrency(totals.subtotal)}
            </div>
          </div>
          <div className="grid grid-cols-2 border-b">
            <div className="border-r p-3 text-right">Discount</div>
            <div className="p-3">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(asNumber(event.target.value))}
                disabled={readOnly}
                className="text-right"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 border-b">
            <div className="border-r p-3 text-right">Tax (%)</div>
            <div className="p-3">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={taxPercentage}
                onChange={(event) =>
                  setTaxPercentage(asNumber(event.target.value))
                }
                disabled={readOnly}
                className="text-right"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 border-b">
            <div className="border-r p-3 text-right">Tax Total</div>
            <div className="p-3 text-right font-semibold">
              {formatCurrency(totals.tax_total)}
            </div>
          </div>
          <div className="grid grid-cols-2 border-b">
            <div className="border-r p-3 text-right">Shipping</div>
            <div className="p-3">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipping}
                onChange={(event) => setShipping(asNumber(event.target.value))}
                disabled={readOnly}
                className="text-right"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 bg-muted/70">
            <div className="border-r p-3 text-right font-semibold">
              Final Total
            </div>
            <div className="p-3 text-right font-bold">
              {formatCurrency(totals.final_total)}
            </div>
          </div>
        </div>
      </section>

      {!readOnly && (
        <div className="space-y-4">
          {canSaveAsRevenue && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="save-invoice-as-revenue"
                checked={saveAsRevenue}
                onCheckedChange={(checked) =>
                  setSaveAsRevenue(checked === true)
                }
              />
              <Label htmlFor="save-invoice-as-revenue">
                Save invoice as revenue
              </Label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? "Saving..." : "Save Invoice"}
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}

export default InvoiceForm
