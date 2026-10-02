// Shared helper functions used by all document template builders

import type { ClientPublic, DocumentPublic } from "@/client"
import { getDocumentStatusStyle } from "@/lib/documentStatus"
import { getUploadUrl } from "@/lib/uploads"
import type { CompanyWithLogo } from "./types"

export const documentTypeLabel: Record<string, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  paymentvoucher: "Payment Voucher",
  deliveryorder: "Delivery Order",
}

export function formatDateDMY(d?: Date | string | null | undefined): string {
  if (!d) return "-"
  let dateObj: Date
  if (typeof d === "string") {
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, day] = match
      return `${day}/${m}/${y}`
    }
    dateObj = new Date(d)
  } else {
    dateObj = d
  }
  if (Number.isNaN(dateObj.getTime())) return "-"
  const day = String(dateObj.getDate()).padStart(2, "0")
  const month = String(dateObj.getMonth() + 1).padStart(2, "0")
  const year = dateObj.getFullYear()
  return `${day}/${month}/${year}`
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function formatMoney(value: unknown) {
  return asNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatQuantity(value: unknown) {
  return asNumber(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function formatMultiline(value: unknown) {
  return escapeHtml(value).replace(/\n/g, "<br />")
}

export interface DocumentLineItem {
  title: string
  description?: string | null
  unit_price: number
  quantity: number
  unit_type: string
  total: number
}

export function getLineItems(document: DocumentPublic): DocumentLineItem[] {
  if (!Array.isArray(document.item)) return []
  return document.item.map((item) => {
    const record = asRecord(item)
    const unitPrice = asNumber(record.unit_price)
    const quantity = asNumber(record.quantity, 1)
    return {
      title: String(record.title ?? ""),
      description:
        typeof record.description === "string" && record.description
          ? record.description
          : null,
      unit_price: unitPrice,
      quantity,
      unit_type: String(record.unit_type ?? ""),
      total: asNumber(record.total, unitPrice * quantity),
    }
  })
}

export function getClientDetails(
  document: DocumentPublic,
  client?: ClientPublic,
) {
  const calculation = asRecord(document.price_calculation)
  const snapshot = asRecord(calculation.client_details)
  return {
    name: String(snapshot.name || client?.name || ""),
    companyName: client?.company_name ?? "",
    regNumber: client?.reg_number ?? "",
    address: client?.billing_address ?? "",
    email: String(snapshot.email || client?.email || ""),
    phone: String(snapshot.phone_number || client?.phone_number || ""),
  }
}

export function getCompanyLines(company?: CompanyWithLogo) {
  if (!company) return []
  return [
    company.company_address,
    [company.company_email, company.phone_number].filter(Boolean).join("  |  "),
  ].filter(Boolean) as string[]
}

export function getLogoUrl(company?: CompanyWithLogo) {
  if (!company?.company_url) return ""
  return getUploadUrl(company.company_url)
}

export function getCompanyInitials(company?: CompanyWithLogo) {
  return (
    company?.company_name
      ?.split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "PH"
  )
}

export function getStatusStyle(status: string) {
  return getDocumentStatusStyle(status)
}
