/**
 * Centralized Plan Limits & Feature Metadata for Frontend.
 *
 * Mirrors the backend entitlement PLAN_LIMITS configuration.
 * Single frontend source of truth for features and plan limit values.
 */

export interface FeatureLimit {
  label: string
  unit?: string
}

export const FEATURE_METADATA: Record<string, FeatureLimit> = {
  companies: { label: "Companies", unit: "companies" },
  staff: { label: "Staff", unit: "staff members" },
  products: { label: "Products", unit: "products" },
  customers: { label: "Customers", unit: "customers" },
  documents: { label: "Documents / month", unit: "documents/month" },
  ocr: { label: "OCR", unit: "OCR scans" },
  ai_summary: { label: "AI Summary", unit: "AI summaries" },
  aiSummary: { label: "AI Summary", unit: "summaries" },
  recurring_invoices: {
    label: "Recurring Invoices",
    unit: "recurring invoices",
  },
  integrations: { label: "Integrations", unit: "integrations" },
}

export type FeatureValue = number | string | null

export const PLAN_FEATURE_LIMITS: Record<
  string,
  Record<string, FeatureValue>
> = {
  personal: {
    companies: 2,
    staff: 1,
    customers: 50,
    products: 50,
    documents: 20,
    ocr: 10,
    ai_summary: "1 / day",
    aiSummary: "1 / day",
    recurring_invoices: 0,
    integrations: 0,
  },
  pro: {
    companies: 10,
    staff: 5,
    customers: 1000,
    products: 500,
    documents: 2000,
    ocr: 500,
    ai_summary: null,
    aiSummary: null,
    recurring_invoices: null,
    integrations: null,
  },
  max: {
    companies: 100,
    staff: null,
    customers: null,
    products: null,
    documents: null,
    ocr: null,
    ai_summary: null,
    aiSummary: null,
    recurring_invoices: null,
    integrations: null,
  },
}

export const PLAN_NAMES: Record<string, string> = {
  personal: "Personal",
  pro: "Pro",
  max: "Max",
}

export const UPGRADE_PATH: Record<string, string | null> = {
  personal: "pro",
  pro: "max",
  max: null,
}

/**
 * Format a feature limit value for display (e.g. 2 -> "2", null -> "Unlimited", 0 -> "None").
 */
export function formatLimitValue(value: FeatureValue): string {
  if (value === null) return "Unlimited"
  if (value === 0) return "None"
  return String(value)
}
