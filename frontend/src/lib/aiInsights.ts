import { AiService } from "@/client"
import type { ParsedReceipt } from "@/lib/receiptParser"

export type AIInsightModuleType = "financial_summary"

export type AIKeyMetric = {
  label: string
  value: string
  trend: "up" | "down" | "flat"
}

export type AIRecommendation = {
  title: string
  rationale: string
  priority: "high" | "medium" | "low"
}

export type AIFinancialSummary = {
  headline: string
  summary: string
  period: string
  key_metrics: AIKeyMetric[]
  strengths: string[]
  concerns: string[]
  recommendations: AIRecommendation[]
  fact_sheet: Record<string, unknown>
  generated_at: string | null
}

export type AIInsightMetadata = {
  title: string
  description: string
}

export const AI_INSIGHT_MODULES: Record<
  AIInsightModuleType,
  AIInsightMetadata
> = {
  financial_summary: {
    title: "AI Financial Summary",
    description:
      "Executive overview with key financial highlights, performance context, and recommendations.",
  },
}

/**
 * Load the stored, company-level AI insight for a single module. Throws a 404 ApiError
 * when no insight has been generated for the company yet.
 */
export function getStoredAIInsight(moduleType: AIInsightModuleType) {
  return AiService.readAiInsight({ moduleType }) as Promise<AIFinancialSummary>
}

/**
 * Generate (or regenerate) the company's AI insight for the given module and
 * period, then persist it on the backend.
 */
export function generateAIInsight(
  moduleType: AIInsightModuleType,
  period: string,
) {
  return AiService.generateAiInsightRoute({
    moduleType,
    period,
  }) as Promise<AIFinancialSummary>
}

export function getStoredFinancialSummary() {
  return getStoredAIInsight("financial_summary")
}

export function generateFinancialSummary(period: string) {
  return generateAIInsight("financial_summary", period)
}

/**
 * Send raw OCR receipt text to the backend, which uses DeepSeek with a strict
 * schema to extract structured expense fields. The response is validated
 * server-side; here we map it onto the form-friendly ParsedReceipt shape.
 */
export async function parseReceiptWithAI(text: string): Promise<ParsedReceipt> {
  const result = await AiService.parseReceipt({
    requestBody: { text },
  })

  return {
    vendor: result.supplier_name ?? undefined,
    amount: result.amount ?? undefined,
    tax: result.tax ?? undefined,
    date: result.date ?? undefined,
    due_date: result.due_date ?? undefined,
    category: result.category ?? undefined,
    invoice_no: result.invoice_no ?? undefined,
    description: result.description ?? undefined,
  }
}
