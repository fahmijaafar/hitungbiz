import { useQuery } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react-motion"
import React, {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ClientsService,
  CompaniesService,
  type CompanyPublic,
  type DocumentCreate,
  DocumentDefaultNoteService,
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
import PURCHASE_CATEGORIES from "@/constants/purchaseCategories"
import { formatCurrency } from "@/lib/currency"
import { getLocalDateString } from "@/lib/utils"

const documentTypes = [
  { value: "quotation", label: "Quotation", prefix: "QTN" },
  { value: "invoice", label: "Invoice", prefix: "INV" },
  { value: "paymentvoucher", label: "Payment Voucher", prefix: "PV" },
  { value: "deliveryorder", label: "Delivery Order", prefix: "DO" },
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

type DocumentType = (typeof documentTypes)[number]["value"]

const documentStatusesByType: Record<DocumentType, readonly string[]> = {
  quotation: ["Draft", "New", "Completed", "Canceled", "Expired"],
  invoice: [
    "Draft",
    "New",
    "Pending",
    "Overdue",
    "Paid",
    "Canceled",
    "Expired",
  ],
  paymentvoucher: [
    "Draft",
    "Pending",
    "Unpaid",
    "Partially Paid",
    "Paid",
    "Canceled",
  ],
  deliveryorder: ["Pending", "Processing", "Processed", "Canceled"],
}

type ClientDetails = {
  name: string
  company_name: string
  email: string
  phone_number: string
}

export type DocumentLineItem = {
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

export type DocumentFormPayload = DocumentCreate | DocumentUpdate
export type DocumentFormSubmitOptions = {
  saveAsRevenue?: boolean
  deductInventory?: boolean
  saveAsExpense?: boolean
  expenseCategory?: string
}

type DocumentFormProps = {
  document?: DocumentPublic
  initialDate?: string
  mode: "create" | "edit" | "view"
  onSubmit?: (
    payload: DocumentFormPayload,
    nextRunningNumbers?: Record<string, number>,
    options?: DocumentFormSubmitOptions,
  ) => void
  isPending?: boolean
}

const today = getLocalDateString()

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

function getLineItems(document?: DocumentPublic): DocumentLineItem[] {
  if (!Array.isArray(document?.item)) {
    return [createEmptyLineItem()]
  }

  const items = document.item as Array<Record<string, unknown>>
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

function createEmptyLineItem(): DocumentLineItem {
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

function getDocumentType(document?: DocumentPublic): DocumentType {
  const match = documentTypes.find((type) => type.value === document?.doctype)
  return match?.value ?? "quotation"
}

function formatDocNo(type: DocumentType, company?: CompanyPublic) {
  const typeMeta =
    documentTypes.find((item) => item.value === type) ?? documentTypes[0]
  const runningNumber = company?.document_running_numbers?.[type] ?? 1
  return `${typeMeta.prefix}${String(runningNumber).padStart(5, "0")}`
}

function getClientSnapshot(document?: DocumentPublic): ClientDetails {
  const calculation = asRecord(document?.price_calculation)
  const client = asRecord(calculation.client_details)
  return {
    name: String(client.name ?? ""),
    company_name: String(client.company_name ?? ""),
    email: String(client.email ?? ""),
    phone_number: String(client.phone_number ?? ""),
  }
}

export function DocumentForm({
  document,
  initialDate,
  mode,
  onSubmit,
  isPending = false,
}: DocumentFormProps) {
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

  const initialCalculation = asRecord(document?.price_calculation)
  const [doctype, setDoctype] = useState<DocumentType>(
    getDocumentType(document),
  )
  const [date, setDate] = useState(initialDate ?? document?.date ?? today)
  const [title, setTitle] = useState(document?.title ?? "")
  const [status, setStatus] = useState(document?.status ?? "Draft")
  const [saveAsRevenue, setSaveAsRevenue] = useState(false)
  const [deductInventory, setDeductInventory] = useState(false)
  const [saveAsExpense, setSaveAsExpense] = useState(false)
  const [expenseCategory, setExpenseCategory] = useState("")
  const [clientId, setClientId] = useState(document?.client_id ?? "manual")
  const [clientDetails, setClientDetails] = useState<ClientDetails>(
    getClientSnapshot(document),
  )
  const [items, setItems] = useState<DocumentLineItem[]>(getLineItems(document))
  const [remark, setRemark] = useState(document?.remark ?? "")

  // Track whether the user has manually edited the remark field.
  // This prevents the default note from overwriting user input.
  const hasUserEditedRemarkRef = useRef(mode !== "create")

  // Fetch default notes (only relevant in create mode)
  const { data: defaultNotes } = useQuery({
    queryKey: ["document-default-notes"],
    queryFn: async () => {
      const res = await DocumentDefaultNoteService.readDocumentDefaultNotes()
      return (res.data ?? []) as Array<{
        document_type: string
        default_notes_enabled: boolean
        default_notes: string
      }>
    },
    enabled: mode === "create",
    staleTime: 60_000,
  })

  // Pre-fill remark from default notes when doctype changes (create mode only)
  useEffect(() => {
    if (mode !== "create" || hasUserEditedRemarkRef.current) return
    const match = defaultNotes?.find((n) => n.document_type === doctype)
    if (match?.default_notes_enabled) {
      setRemark(match.default_notes)
    } else {
      setRemark("")
    }
  }, [doctype, defaultNotes, mode])
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
    mode === "create" ? formatDocNo(doctype, company) : (document?.docno ?? "")

  const documentStatuses = documentStatusesByType[doctype]

  useEffect(() => {
    if (documentStatuses.includes(status)) return
    setStatus(documentStatuses[0])
  }, [documentStatuses, status])

  const canSaveAsRevenue =
    doctype === "invoice" &&
    status === "Paid" &&
    (mode === "create" || document?.status !== "Paid")

  useEffect(() => {
    if (canSaveAsRevenue) return
    setSaveAsRevenue(false)
  }, [canSaveAsRevenue])

  const canDeductInventory =
    doctype === "deliveryorder" &&
    status === "Processed" &&
    !document?.stock_deducted

  useEffect(() => {
    if (canDeductInventory) return
    setDeductInventory(false)
  }, [canDeductInventory])

  const canSaveAsExpense =
    doctype === "paymentvoucher" &&
    status === "Paid" &&
    (mode === "create" || document?.status !== "Paid")

  useEffect(() => {
    if (canSaveAsExpense) return
    setSaveAsExpense(false)
    setExpenseCategory("")
  }, [canSaveAsExpense])

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

  const updateItem = (index: number, patch: Partial<DocumentLineItem>) => {
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

    const payload: DocumentFormPayload = {
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
      deductInventory: canDeductInventory && deductInventory,
      saveAsExpense: canSaveAsExpense && saveAsExpense,
      expenseCategory:
        canSaveAsExpense && saveAsExpense ? expenseCategory : undefined,
    })
  }

  return (
    <form className="flex flex-col max-h-[75vh]" onSubmit={handleSubmit}>
      <div className="flex-1 overflow-y-auto py-4 space-y-6 px-1">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select
              value={doctype}
              onValueChange={(value) => setDoctype(value as DocumentType)}
              disabled={readOnly || mode === "edit"}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <DateInput
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label>Doc No</Label>
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
                {documentStatuses.map((s) => (
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
                    updateItem(index, {
                      quantity: asNumber(event.target.value),
                    })
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
                onChange={(event) => {
                  hasUserEditedRemarkRef.current = true
                  setRemark(event.target.value)
                }}
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
                  onChange={(event) =>
                    setDiscount(asNumber(event.target.value))
                  }
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
                  onChange={(event) =>
                    setShipping(asNumber(event.target.value))
                  }
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
      </div>

      {!readOnly && (
        <div className="pt-4 border-t shrink-0 space-y-4">
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
          {canDeductInventory && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="remove-product-stock"
                checked={deductInventory}
                onCheckedChange={(checked) =>
                  setDeductInventory(checked === true)
                }
              />
              <Label htmlFor="remove-product-stock">
                Remove product stock from inventory
              </Label>
            </div>
          )}
          {canSaveAsExpense && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="save-pv-as-expense"
                  checked={saveAsExpense}
                  onCheckedChange={(checked) => {
                    setSaveAsExpense(checked === true)
                    if (!checked) setExpenseCategory("")
                  }}
                />
                <Label htmlFor="save-pv-as-expense">
                  Save payment voucher as expense
                </Label>
              </div>
              {saveAsExpense && (
                <div className="ml-6 space-y-1">
                  <Label htmlFor="expense-category-select">
                    Expense Category
                  </Label>
                  <Select
                    value={expenseCategory}
                    onValueChange={setExpenseCategory}
                  >
                    <SelectTrigger
                      id="expense-category-select"
                      className="w-full sm:w-80"
                    >
                      <SelectValue placeholder="Select expense category" />
                    </SelectTrigger>
                    <SelectContent>
                      {PURCHASE_CATEGORIES.map((group) => (
                        <React.Fragment key={group.title}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {group.title}
                          </div>
                          {group.items.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </React.Fragment>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? "Saving..." : "Save Document"}
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}

export default DocumentForm
