import { Loader as Loader2, Upload, X } from "lucide-react-motion"
import { useRef, useState } from "react"

import { UploadsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import useCustomToast from "@/hooks/useCustomToast"
import { getUploadUrl } from "@/lib/uploads"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

type CompanyLogoUploadProps = {
  currentUrl?: string | null
  onUploadComplete: (url: string) => void
  disabled?: boolean
}

export default function CompanyLogoUpload({
  currentUrl,
  onUploadComplete,
  disabled = false,
}: CompanyLogoUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      showErrorToast(
        "Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.",
      )
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      showErrorToast("File too large. Maximum size is 2 MB.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    // Show local preview
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)

    // Upload to backend
    setUploading(true)
    try {
      const result = (await UploadsService.uploadCompanyLogo({
        formData: { file },
      })) as { url: string }
      onUploadComplete(result.url)
      setPreview(result.url)
      showSuccessToast("Logo uploaded successfully")
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Upload failed")
      // Revert preview to original
      setPreview(currentUrl ?? null)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleRemove = () => {
    setPreview(null)
    onUploadComplete("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-2">
      <Label>Company Logo</Label>
      <div className="flex items-center gap-4">
        {/* Preview area */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {preview ? (
            <img
              src={getUploadUrl(preview)}
              alt="Company logo preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.webp,.gif"
            onChange={handleFileSelect}
            disabled={disabled || uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={triggerFileInput}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : preview ? (
              "Replace Logo"
            ) : (
              "Upload Logo"
            )}
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={disabled || uploading}
              onClick={handleRemove}
            >
              <X className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Accepted formats: JPEG, PNG, WebP, GIF. Max size: 2 MB. Will be resized
        to 800×800 max.
      </p>
    </div>
  )
}
