import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalDateString(
  d: Date | string | null | undefined = new Date(),
): string {
  if (!d) return getLocalDateString(new Date())
  if (typeof d === "string") {
    if (d.length >= 10 && d.includes("-")) {
      return d.slice(0, 10)
    }
    const dateObj = new Date(d)
    if (Number.isNaN(dateObj.getTime())) return getLocalDateString(new Date())
    d = dateObj
  }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

export function formatDateTimeDMY(
  d?: Date | string | null | undefined,
): string {
  if (!d) return "-"
  const dateObj = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(dateObj.getTime())) return "-"
  const day = String(dateObj.getDate()).padStart(2, "0")
  const month = String(dateObj.getMonth() + 1).padStart(2, "0")
  const year = dateObj.getFullYear()
  const hours = String(dateObj.getHours()).padStart(2, "0")
  const minutes = String(dateObj.getMinutes()).padStart(2, "0")
  const seconds = String(dateObj.getSeconds()).padStart(2, "0")
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}
