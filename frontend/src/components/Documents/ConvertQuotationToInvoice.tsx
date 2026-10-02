import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FilePlus as FilePlus2 } from "lucide-react-motion"
import { useState } from "react"

import {
  CompaniesService,
  type DocumentCreate,
  type DocumentPublic,
  DocumentsService,
} from "@/client"
import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import useCustomToast from "@/hooks/useCustomToast"
import { UPGRADE_PATH } from "@/lib/planLimits"

type ConvertQuotationToInvoiceProps = {
  document: DocumentPublic
  onSuccess?: () => void
}

function getTodayDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatInvoiceDocNo(runningNumber: number) {
  return `INV${String(runningNumber).padStart(5, "0")}`
}

const ConvertQuotationToInvoice = ({
  document,
  onSuccess,
}: ConvertQuotationToInvoiceProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [upgradeModalState, setUpgradeModalState] = useState({
    open: false,
    feature: "documents",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 20,
    limitType: undefined as string | undefined,
    retryAt: null as string | null,
    recommendedPlan: "pro" as string | null,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const companyId =
        document.company_id ?? localStorage.getItem("company_id")

      if (!companyId) {
        throw new Error(
          "Please select a company before converting the quotation.",
        )
      }

      const company = await CompaniesService.readCompany({ id: companyId })
      const runningNumber = company.document_running_numbers?.invoice ?? 1

      const payload: DocumentCreate = {
        company_id: companyId,
        user_id: document.user_id,
        docno: formatInvoiceDocNo(runningNumber),
        doctype: "invoice",
        client_id: document.client_id,
        date: getTodayDate(),
        title: document.title,
        item: document.item,
        price_calculation: document.price_calculation,
        remark: document.remark,
        status: "Draft",
        validity: document.validity,
        duedate: document.duedate,
      }

      const invoice = await DocumentsService.createDocument({
        requestBody: payload,
      })

      await CompaniesService.updateCompany({
        id: companyId,
        requestBody: {
          document_running_numbers: {
            ...(company.document_running_numbers ?? {}),
            invoice: runningNumber + 1,
          },
        },
      })

      return invoice
    },
    onSuccess: () => {
      showSuccessToast("Invoice created from quotation")
      onSuccess?.()
    },
    onError: (error: any) => {
      const errDetail = error?.body?.detail
      if (
        errDetail &&
        typeof errDetail === "object" &&
        errDetail.error === "LIMIT_REACHED"
      ) {
        setUpgradeModalState({
          open: true,
          feature: errDetail.feature || "documents",
          currentPlan: errDetail.plan || "personal",
          currentUsage: errDetail.current_usage ?? 0,
          limit: errDetail.limit ?? 20,
          limitType: errDetail.limit_type,
          retryAt: errDetail.retry_at ?? null,
          recommendedPlan:
            errDetail.next_plan ?? UPGRADE_PATH[errDetail.plan] ?? null,
        })
      } else {
        showErrorToast(
          error instanceof Error
            ? error.message
            : "Unable to convert quotation.",
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] })
      queryClient.invalidateQueries({ queryKey: ["company"] })
      queryClient.invalidateQueries({ queryKey: ["companyName"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
    },
  })

  if (document.doctype !== "quotation") {
    return null
  }

  return (
    <>
      <DropdownMenuItem
        disabled={mutation.isPending}
        onSelect={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <FilePlus2 />
        {mutation.isPending ? "Converting..." : "Convert to Invoice"}
      </DropdownMenuItem>
      <UpgradeModal
        open={upgradeModalState.open}
        onClose={() =>
          setUpgradeModalState((prev) => ({ ...prev, open: false }))
        }
        feature={upgradeModalState.feature}
        currentPlan={upgradeModalState.currentPlan}
        currentUsage={upgradeModalState.currentUsage}
        limit={upgradeModalState.limit}
        limitType={upgradeModalState.limitType}
        retryAt={upgradeModalState.retryAt}
        recommendedPlan={upgradeModalState.recommendedPlan}
      />
    </>
  )
}

export default ConvertQuotationToInvoice
