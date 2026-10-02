import type { DocumentPublic, SaleCreate } from "@/client"

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

export function createRevenuePayloadFromInvoice(
  invoice: DocumentPublic,
): SaleCreate {
  const calculation = asRecord(invoice.price_calculation)
  const clientDetails = asRecord(calculation.client_details)
  const finalTotal = asNumber(calculation.final_total)

  return {
    date: invoice.date,
    channel: String(
      clientDetails.company_name || clientDetails.name || "Invoice",
    ),
    notes: invoice.title,
    company_id: invoice.company_id,
    user_id: invoice.user_id,
    gross_amount: asNumber(calculation.subtotal),
    discount: asNumber(calculation.discount),
    net_sales: finalTotal,
    cancel_amount: 0,
    short_over: 0,
    refund: 0,
    final_amount: finalTotal,
    status: "Completed",
  }
}
