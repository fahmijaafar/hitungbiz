export type DocumentStatusKey =
  | "draft"
  | "new"
  | "pending"
  | "processing"
  | "processed"
  | "overdue"
  | "paid"
  | "completed"
  | "partially paid"
  | "partially_paid"
  | "cancelled"
  | "canceled"
  | "expired"

export interface DocumentStatusStyle {
  primaryHex: string
  className: string
  colorStyle: string
}

export const DOCUMENT_STATUS_CONFIG: Record<
  string,
  { primaryHex: string; className: string }
> = {
  draft: {
    primaryHex: "#9CA3AF",
    className:
      "text-[#9CA3AF] bg-[#9CA3AF]/10 border-[#9CA3AF]/20 dark:text-[#9CA3AF] dark:bg-[#9CA3AF]/15 dark:border-[#9CA3AF]/30",
  },
  new: {
    primaryHex: "#3B82F6",
    className:
      "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20 dark:text-[#3B82F6] dark:bg-[#3B82F6]/15 dark:border-[#3B82F6]/30",
  },
  pending: {
    primaryHex: "#F59E0B",
    className:
      "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20 dark:text-[#F59E0B] dark:bg-[#F59E0B]/15 dark:border-[#F59E0B]/30",
  },
  processing: {
    primaryHex: "#3B82F6",
    className:
      "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20 dark:text-[#3B82F6] dark:bg-[#3B82F6]/15 dark:border-[#3B82F6]/30",
  },
  processed: {
    primaryHex: "#22C55E",
    className:
      "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20 dark:text-[#22C55E] dark:bg-[#22C55E]/15 dark:border-[#22C55E]/30",
  },
  "partially paid": {
    primaryHex: "#F59E0B",
    className:
      "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20 dark:text-[#F59E0B] dark:bg-[#F59E0B]/15 dark:border-[#F59E0B]/30",
  },
  partially_paid: {
    primaryHex: "#F59E0B",
    className:
      "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20 dark:text-[#F59E0B] dark:bg-[#F59E0B]/15 dark:border-[#F59E0B]/30",
  },
  partiallypaid: {
    primaryHex: "#F59E0B",
    className:
      "text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20 dark:text-[#F59E0B] dark:bg-[#F59E0B]/15 dark:border-[#F59E0B]/30",
  },
  overdue: {
    primaryHex: "#EF4444",
    className:
      "text-[#EF4444] bg-[#EF4444]/15 border-[#EF4444]/25 dark:text-[#EF4444] dark:bg-[#EF4444]/20 dark:border-[#EF4444]/35 font-semibold",
  },
  paid: {
    primaryHex: "#22C55E",
    className:
      "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20 dark:text-[#22C55E] dark:bg-[#22C55E]/15 dark:border-[#22C55E]/30",
  },
  completed: {
    primaryHex: "#22C55E",
    className:
      "text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20 dark:text-[#22C55E] dark:bg-[#22C55E]/15 dark:border-[#22C55E]/30",
  },
  cancelled: {
    primaryHex: "#F87171",
    className:
      "text-[#F87171] bg-[#F87171]/10 border-[#F87171]/20 dark:text-[#F87171] dark:bg-[#F87171]/15 dark:border-[#F87171]/30",
  },
  canceled: {
    primaryHex: "#F87171",
    className:
      "text-[#F87171] bg-[#F87171]/10 border-[#F87171]/20 dark:text-[#F87171] dark:bg-[#F87171]/15 dark:border-[#F87171]/30",
  },
  expired: {
    primaryHex: "#A78BFA",
    className:
      "text-[#A78BFA] bg-[#A78BFA]/10 border-[#A78BFA]/20 dark:text-[#A78BFA] dark:bg-[#A78BFA]/15 dark:border-[#A78BFA]/30",
  },
}

export function getDocumentStatusStyle(
  status?: string | null,
): DocumentStatusStyle {
  const normalized = (status ?? "").trim().toLowerCase()
  const config =
    DOCUMENT_STATUS_CONFIG[normalized] ?? DOCUMENT_STATUS_CONFIG.draft
  return {
    primaryHex: config.primaryHex,
    className: config.className,
    colorStyle: config.primaryHex,
  }
}
