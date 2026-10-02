import { OpenAPI } from "@/client"

export const getUploadUrl = (url: string) => {
  if (!url) return ""
  if (/^(blob:|data:|https?:\/\/)/.test(url) || /^\/?assets\//.test(url)) {
    return url
  }

  const baseUrl = (OpenAPI.BASE || import.meta.env.VITE_API_URL || "").replace(
    /\/$/,
    "",
  )
  return `${baseUrl}${url.startsWith("/") ? url : `/${url}`}`
}
