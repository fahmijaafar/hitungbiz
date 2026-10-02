import type { CompanyPublic } from "@/client"
import { formatCurrency } from "@/lib/currency"
import type {
  BalanceSheet,
  CashFlow,
  DateRange,
  ProfitLoss,
} from "@/lib/reports"
import { escapeHtml } from "@/lib/templates/helpers"

export type FinancialReportType = "profit-loss" | "balance-sheet" | "cash-flow"

export interface FinancialReportPrintParams {
  type: FinancialReportType
  company?: CompanyPublic | null
  range: DateRange
  profitLoss?: ProfitLoss
  balanceSheet?: BalanceSheet
  cashFlow?: CashFlow
}

function formatDateDisplay(isoDateStr: string): string {
  if (!isoDateStr) return ""
  const parts = isoDateStr.split("-")
  if (parts.length === 3) {
    const [y, m, d] = parts
    return `${d}/${m}/${y}`
  }
  return isoDateStr
}

export function generateFinancialReportHtml({
  type,
  company,
  range,
  profitLoss,
  balanceSheet,
  cashFlow,
}: FinancialReportPrintParams): string {
  const companyName = company?.company_name || "Company Name"
  const addressLine = company?.company_address || ""
  const contactLine = [company?.phone_number, company?.company_email]
    .filter(Boolean)
    .join(" | ")
  const addressAndPhone =
    [addressLine, contactLine].filter(Boolean).join("<br />") ||
    "Address and phone"

  let reportTitle = ""
  let periodSubtitle = ""
  let tableContentHtml = ""

  const formattedEnd = formatDateDisplay(range.end)

  if (type === "profit-loss") {
    reportTitle = "Profit & Loss Statement"
    periodSubtitle = `For Period Ending: ${formattedEnd}`

    const pl = profitLoss || {
      revenueByChannel: [],
      expensesByCategory: [],
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
    }

    const incomeRows =
      pl.revenueByChannel.length > 0
        ? pl.revenueByChannel
            .map(
              (r) => `
          <tr class="item-row">
            <td class="item-name">${escapeHtml(r.label)}</td>
            <td class="item-amount">${formatCurrency(r.amount)}</td>
          </tr>`,
            )
            .join("")
        : `
          <tr class="item-row">
            <td class="item-name">Sales</td>
            <td class="item-amount">${formatCurrency(0)}</td>
          </tr>
          <tr class="item-row">
            <td class="item-name">Services</td>
            <td class="item-amount">${formatCurrency(0)}</td>
          </tr>
          <tr class="item-row">
            <td class="item-name">Other</td>
            <td class="item-amount">${formatCurrency(0)}</td>
          </tr>`

    const expenseRows =
      pl.expensesByCategory.length > 0
        ? pl.expensesByCategory
            .map(
              (r) => `
          <tr class="item-row">
            <td class="item-name">${escapeHtml(r.label)}</td>
            <td class="item-amount">${formatCurrency(r.amount)}</td>
          </tr>`,
            )
            .join("")
        : `
          <tr class="item-row">
            <td class="item-name">Operating Expenses</td>
            <td class="item-amount">${formatCurrency(0)}</td>
          </tr>`

    tableContentHtml = `
      <!-- Income Section -->
      <tr>
        <td colspan="2" class="section-header">Income</td>
      </tr>
      ${incomeRows}
      <tr class="subtotal-row">
        <td class="item-name">Total</td>
        <td class="item-amount">${formatCurrency(pl.totalRevenue)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <!-- Expenses Section -->
      <tr>
        <td colspan="2" class="section-header">Expenses</td>
      </tr>
      ${expenseRows}
      <tr class="subtotal-row">
        <td class="item-name">Total</td>
        <td class="item-amount">${formatCurrency(pl.totalExpenses)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <!-- Grand Total Row -->
      <tr class="grand-total-row">
        <td class="item-name">Profit/Loss</td>
        <td class="item-amount">${formatCurrency(pl.netProfit)}</td>
      </tr>
    `
  } else if (type === "balance-sheet") {
    reportTitle = "Balance Sheet Statement"
    periodSubtitle = `For Period Ending: ${formattedEnd}`

    const bs = balanceSheet || {
      cashRows: [],
      totalCash: 0,
      accountsReceivable: 0,
      inventoryValue: 0,
      totalAssets: 0,
      accountsPayable: 0,
      totalLiabilities: 0,
      equity: 0,
      totalLiabilitiesAndEquity: 0,
    }

    const cashRowsHtml =
      bs.cashRows.length > 0
        ? bs.cashRows
            .map(
              (r) => `
          <tr class="item-row">
            <td class="item-name">Cash & Bank - ${escapeHtml(r.label)}</td>
            <td class="item-amount">${formatCurrency(r.amount)}</td>
          </tr>`,
            )
            .join("")
        : `
          <tr class="item-row">
            <td class="item-name">Cash & Bank</td>
            <td class="item-amount">${formatCurrency(0)}</td>
          </tr>`

    tableContentHtml = `
      <!-- Assets Section -->
      <tr>
        <td colspan="2" class="section-header">Assets</td>
      </tr>
      ${cashRowsHtml}
      <tr class="item-row">
        <td class="item-name">Accounts Receivable</td>
        <td class="item-amount">${formatCurrency(bs.accountsReceivable)}</td>
      </tr>
      <tr class="item-row">
        <td class="item-name">Inventory</td>
        <td class="item-amount">${formatCurrency(bs.inventoryValue)}</td>
      </tr>
      <tr class="subtotal-row">
        <td class="item-name">Total Assets</td>
        <td class="item-amount">${formatCurrency(bs.totalAssets)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <!-- Liabilities Section -->
      <tr>
        <td colspan="2" class="section-header">Liabilities</td>
      </tr>
      <tr class="item-row">
        <td class="item-name">Accounts Payable</td>
        <td class="item-amount">${formatCurrency(bs.accountsPayable)}</td>
      </tr>
      <tr class="subtotal-row">
        <td class="item-name">Total Liabilities</td>
        <td class="item-amount">${formatCurrency(bs.totalLiabilities)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <!-- Equity Section -->
      <tr>
        <td colspan="2" class="section-header">Equity</td>
      </tr>
      <tr class="item-row">
        <td class="item-name">Current Period Profit</td>
        <td class="item-amount">${formatCurrency(bs.equity)}</td>
      </tr>
      <tr class="subtotal-row">
        <td class="item-name">Total Equity</td>
        <td class="item-amount">${formatCurrency(bs.equity)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <!-- Grand Total Row -->
      <tr class="grand-total-row">
        <td class="item-name">Total Liabilities & Equity</td>
        <td class="item-amount">${formatCurrency(bs.totalLiabilitiesAndEquity)}</td>
      </tr>
    `
  } else if (type === "cash-flow") {
    reportTitle = "Cash Flow Statement"
    periodSubtitle = `For Period Ending: ${formattedEnd}`

    const cf = cashFlow || {
      inflowsByChannel: [],
      outflowsByCategory: [],
      totalInflows: 0,
      totalOutflows: 0,
      netCashFlow: 0,
      openingBalance: 0,
      closingBalance: 0,
    }

    const inflowRows =
      cf.inflowsByChannel.length > 0
        ? cf.inflowsByChannel
            .map(
              (r) => `
          <tr class="item-row">
            <td class="item-name">${escapeHtml(r.label)}</td>
            <td class="item-amount">${formatCurrency(r.amount)}</td>
          </tr>`,
            )
            .join("")
        : `
          <tr class="item-row">
            <td class="item-name">Sales Receipts</td>
            <td class="item-amount">${formatCurrency(0)}</td>
          </tr>`

    const outflowRows =
      cf.outflowsByCategory.length > 0
        ? cf.outflowsByCategory
            .map(
              (r) => `
          <tr class="item-row">
            <td class="item-name">${escapeHtml(r.label)}</td>
            <td class="item-amount">${formatCurrency(r.amount)}</td>
          </tr>`,
            )
            .join("")
        : `
          <tr class="item-row">
            <td class="item-name">Purchase Payments</td>
            <td class="item-amount">${formatCurrency(0)}</td>
          </tr>`

    tableContentHtml = `
      <!-- Cash Inflows Section -->
      <tr>
        <td colspan="2" class="section-header">Cash Inflows</td>
      </tr>
      ${inflowRows}
      <tr class="subtotal-row">
        <td class="item-name">Total Inflows</td>
        <td class="item-amount">${formatCurrency(cf.totalInflows)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <!-- Cash Outflows Section -->
      <tr>
        <td colspan="2" class="section-header">Cash Outflows</td>
      </tr>
      ${outflowRows}
      <tr class="subtotal-row">
        <td class="item-name">Total Outflows</td>
        <td class="item-amount">${formatCurrency(cf.totalOutflows)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <!-- Cash Position Section -->
      <tr>
        <td colspan="2" class="section-header">Cash Summary</td>
      </tr>
      <tr class="item-row">
        <td class="item-name">Opening Cash Balance</td>
        <td class="item-amount">${formatCurrency(cf.openingBalance)}</td>
      </tr>
      <tr class="item-row">
        <td class="item-name">Net Cash Flow</td>
        <td class="item-amount">${formatCurrency(cf.netCashFlow)}</td>
      </tr>

      <tr class="spacer-row"><td colspan="2"></td></tr>

      <tr class="grand-total-row">
        <td class="item-name">Closing Cash Balance</td>
        <td class="item-amount">${formatCurrency(cf.closingBalance)}</td>
      </tr>
    `
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #000000;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .report-container {
      width: 100%;
      max-width: 780px;
      margin: 0 auto;
      padding: 10px;
    }
    .report-header {
      text-align: center;
      margin-bottom: 24px;
    }
    .company-name {
      font-size: 24px;
      font-weight: 700;
      color: #000000;
      margin-bottom: 4px;
    }
    .company-contact {
      font-size: 13px;
      color: #333333;
      margin-bottom: 18px;
      line-height: 1.4;
    }
    .report-title {
      font-size: 20px;
      font-weight: 700;
      color: #000000;
      margin-bottom: 4px;
    }
    .report-subtitle {
      font-size: 13px;
      font-weight: 700;
      color: #000000;
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      border: 1.5px solid #000000;
    }
    .report-table th,
    .report-table td {
      padding: 6px 10px;
      border: 1px solid #d1d5db;
    }
    .report-table .section-header {
      background-color: #00a5d4 !important;
      color: #000000 !important;
      font-weight: 700;
      font-size: 14px;
      border: 1px solid #00a5d4;
    }
    .report-table .item-row td {
      background-color: #ffffff;
    }
    .report-table .item-name {
      text-align: left;
      width: 70%;
      color: #000000;
    }
    .report-table .item-amount {
      text-align: right;
      width: 30%;
      color: #000000;
      font-variant-numeric: tabular-nums;
    }
    .report-table .subtotal-row td {
      background-color: #e5e7eb !important;
      font-weight: 700;
      font-style: italic;
      color: #000000;
      border-top: 1px solid #9ca3af;
      border-bottom: 1px solid #9ca3af;
    }
    .report-table .spacer-row td {
      height: 8px;
      padding: 0;
      border-left: 1px solid #d1d5db;
      border-right: 1px solid #d1d5db;
      border-top: none;
      border-bottom: none;
      background-color: #ffffff;
    }
    .report-table .grand-total-row td {
      background-color: #cbd5e1 !important;
      font-weight: 700;
      font-size: 14px;
      color: #000000;
      border-top: 2px solid #000000;
      border-bottom: 2px solid #000000;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <div class="company-name">${escapeHtml(companyName)}</div>
      <div class="company-contact">${addressAndPhone}</div>
      <div class="report-title">${escapeHtml(reportTitle)}</div>
      <div class="report-subtitle">${escapeHtml(periodSubtitle)}</div>
    </div>
    <table class="report-table">
      <tbody>
        ${tableContentHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`
}

export function printFinancialReport(params: FinancialReportPrintParams) {
  const html = generateFinancialReportHtml(params)

  const iframe = window.document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.right = "0"
  iframe.style.bottom = "0"
  iframe.style.width = "0"
  iframe.style.height = "0"
  iframe.style.border = "0"
  iframe.style.visibility = "hidden"

  window.document.body.appendChild(iframe)

  const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument
  if (iframeDoc) {
    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()
  }

  window.setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }, 1000)
  }, 300)
}
