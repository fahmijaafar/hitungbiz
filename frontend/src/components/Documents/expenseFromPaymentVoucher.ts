import type { DocumentPublic, PurchaseCreate } from "@/client"

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

export function createExpensePayloadFromPaymentVoucher(
  document: DocumentPublic,
  category: string,
): PurchaseCreate {
  const calculation = asRecord(document.price_calculation)
  const clientDetails = asRecord(calculation.client_details)
  const finalTotal = asNumber(calculation.final_total)
  const subtotal = asNumber(calculation.subtotal)
  const taxTotal = asNumber(calculation.tax_total)

  return {
    date: document.date ?? "",
    supplier_name: String(
      clientDetails.company_name || clientDetails.name || "Payment Voucher",
    ),
    category,
    notes: document.title,
    company_id: document.company_id,
    user_id: document.user_id,
    invoice_no: document.docno ?? null,
    amount: subtotal,
    tax: taxTotal,
    final_amount: finalTotal,
    status: "Paid",
  }
}
