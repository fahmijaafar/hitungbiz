export function getAppCurrency(): string {
  return localStorage.getItem("app_currency") || "RM"
}

export function setAppCurrency(v: string) {
  localStorage.setItem("app_currency", v)
  // notify listeners
  try {
    window.dispatchEvent(new Event("app_currency_change"))
  } catch (_e) {
    // ignore
  }
}

export function formatCurrency(v: unknown): string {
  const currency = getAppCurrency()
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-"
  const n = Number(v)
  const abs = Math.abs(n)
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)
    return n < 0 ? `-${formatted}` : formatted
  } catch {
    // Fallback if currency code is not recognized by Intl
    const formatted = abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return n < 0 ? `-${currency} ${formatted}` : `${currency} ${formatted}`
  }
}
