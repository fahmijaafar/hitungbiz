import { ScanLine } from "lucide-react-motion"
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist"
import { useRef, useState } from "react"
import Tesseract from "tesseract.js"

// Configure pdfjs worker
GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${"2.16.105"}/pdf.worker.min.js`

import UpgradeModal from "@/components/UpgradePlan/UpgradeModal"
import { Button } from "@/components/ui/button"
import useCustomToast from "@/hooks/useCustomToast"
import { parseReceiptWithAI } from "@/lib/aiInsights"
import { UPGRADE_PATH } from "@/lib/planLimits"
import { type ParsedReceipt, parseReceiptText } from "@/lib/receiptParser"

interface ScanReceiptProps {
  onScanned: (fields: ParsedReceipt) => void
}

/**
 * "Scan Receipt" control. Runs OCR entirely in the browser (WASM) so the
 * receipt image never leaves the device and is never persisted to disk.
 * The extracted text is then sent to the backend AI parser, which returns
 * structured expense fields. If the AI parser is unavailable, we fall back to
 * a best-effort local parse so the modal can still be prefilled.
 */
const ScanReceipt = ({ onScanned }: ScanReceiptProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [upgradeModalState, setUpgradeModalState] = useState({
    open: false,
    feature: "ocr",
    currentPlan: "personal",
    currentUsage: 0,
    limit: 10,
    limitType: undefined as string | undefined,
    retryAt: null as string | null,
    recommendedPlan: "pro" as string | null,
  })
  const { showErrorToast } = useCustomToast()

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsScanning(true)
    try {
      let text = ""
      if (file.type === "application/pdf") {
        // Extract text from PDF using pdfjs
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await getDocument({ data: arrayBuffer }).promise
        const maxPages = pdf.numPages
        const pageTexts = []
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const strings = (content.items as any[]).map((item) => item.str)
          pageTexts.push(strings.join(" "))
        }
        text = pageTexts.join("\n")
      } else {
        const { data } = await Tesseract.recognize(file, "eng")
        text = data.text ?? ""
      }
      try {
        onScanned(await parseReceiptWithAI(text))
      } catch (error: any) {
        const errDetail = error?.body?.detail
        if (
          errDetail &&
          typeof errDetail === "object" &&
          errDetail.error === "LIMIT_REACHED"
        ) {
          setUpgradeModalState({
            open: true,
            feature: errDetail.feature || "ocr",
            currentPlan: errDetail.plan || "personal",
            currentUsage: errDetail.current_usage ?? 0,
            limit: errDetail.limit ?? 10,
            limitType: errDetail.limit_type,
            retryAt: errDetail.retry_at ?? null,
            recommendedPlan:
              errDetail.next_plan ?? UPGRADE_PATH[errDetail.plan] ?? null,
          })
          return
        }
        // AI parsing unavailable/failed — fall back to local best-effort parse.
        showErrorToast(
          "AI couldn't read the receipt; we filled in what we could. Please review the fields.",
        )
        onScanned(parseReceiptText(text))
      }
    } catch {
      showErrorToast(
        "We couldn't extract all details; please fill in the missing fields manually.",
      )
      // Still open the modal so the user can enter the details manually.
      onScanned({})
    } finally {
      setIsScanning(false)
      // Release the file reference so the image can be garbage-collected and
      // allow re-selecting the same file again.
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        disabled={isScanning}
        onClick={() => inputRef.current?.click()}
        className="h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-4"
        aria-label={isScanning ? "Scanning…" : "Scan Receipt"}
        title={isScanning ? "Scanning…" : "Scan Receipt"}
      >
        <ScanLine className="h-5 w-5 sm:h-4 sm:w-4 sm:mr-2" />
        <span className="hidden sm:inline">
          {isScanning ? "Scanning…" : "Scan Receipt"}
        </span>
      </Button>
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

export default ScanReceipt
