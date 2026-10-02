// Modern template — professional corporate style with colored header,
// card-style totals, and clean footer. Visually distinct from Basic.

import {
  asRecord,
  documentTypeLabel,
  escapeHtml,
  formatDateDMY,
  formatMoney,
  formatMultiline,
  formatQuantity,
  getClientDetails,
  getCompanyInitials,
  getLineItems,
  getLogoUrl,
  getStatusStyle,
} from "./helpers"
import type { TemplateBuilderArgs } from "./types"

// Brand colour used throughout the Modern template
const BRAND = "#1e3a5f"
const BRAND_LIGHT = "#e8f0fa"
const ACCENT = "#2563eb"

export function buildModernTemplate({
  document,
  company,
  client,
}: TemplateBuilderArgs): string {
  const calculation = asRecord(document.price_calculation)
  const clientDetails = getClientDetails(document, client)
  const lineItems = getLineItems(document)
  const typeLabel =
    documentTypeLabel[document.doctype]?.toUpperCase() ??
    document.doctype.toUpperCase()
  const currency = company?.currency || "RM"
  const logoUrl = getLogoUrl(company)
  const companyInitials = getCompanyInitials(company)
  const statusStyle = getStatusStyle(document.status)

  const companyName = company?.company_name ?? "Company"
  const companyRegNo = company?.registration_number
    ? `(${company.registration_number})`
    : ""

  // Bill-to label
  const billLabel = document.doctype === "paymentvoucher" ? "Pay To" : "Bill To"

  // Client address lines
  const clientLines = [
    clientDetails.companyName || clientDetails.name,
    clientDetails.companyName &&
    clientDetails.name !== clientDetails.companyName
      ? clientDetails.name
      : "",
    clientDetails.regNumber ? `Reg: ${clientDetails.regNumber}` : "",
    clientDetails.address,
    clientDetails.email,
    clientDetails.phone,
  ]
    .filter(Boolean)
    .map((line) => `<div>${formatMultiline(line)}</div>`)
    .join("")

  // Line item rows
  const rows = lineItems
    .map((item, index) => {
      const titleLines = item.title.split("\n")
      const itemName = escapeHtml(titleLines[0])
      const inlinedDesc = titleLines.slice(1).join("\n")
      const descText = inlinedDesc || item.description || null
      return `
        <tr class="${index % 2 === 0 ? "row-even" : "row-odd"}">
          <td class="center num">${index + 1}</td>
          <td class="desc-cell">
            <div class="item-name">${itemName}</div>
            ${descText ? `<div class="item-desc">${formatMultiline(descText)}</div>` : ""}
          </td>
          <td class="right">${formatMoney(item.unit_price)}</td>
          <td class="center">${formatQuantity(item.quantity)}&nbsp;${escapeHtml(item.unit_type)}</td>
          <td class="right bold">${formatMoney(item.total)}</td>
        </tr>
      `
    })
    .join("")

  // Date meta rows in header
  const dateRows = (
    [
      [
        `${documentTypeLabel[document.doctype] ?? "Document"} Date`,
        formatDateDMY(document.date),
      ] as [string, string],
      document.validity
        ? (["Valid Until", formatDateDMY(document.validity)] as [
            string,
            string,
          ])
        : null,
      document.duedate
        ? (["Due Date", formatDateDMY(document.duedate)] as [string, string])
        : null,
    ] as ([string, string] | null)[]
  )
    .filter((x): x is [string, string] => x !== null)
    .map(
      ([label, value]) =>
        `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`,
    )
    .join("")

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(typeLabel)} ${escapeHtml(document.docno)}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #f0f4f8;
            color: #1e293b;
            font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.5;
          }

          /* ── Outer page ── */
          .page {
            width: min(100%, 210mm);
            min-height: 297mm;
            margin: 24px auto;
            background: #ffffff;
            box-shadow: 0 8px 40px rgba(30,58,95,.18);
            display: flex;
            flex-direction: column;
          }

          /* ── Coloured header band ── */
          .header {
            background: ${BRAND};
            color: #ffffff;
            padding: 28px 32px 24px;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 24px;
            align-items: center;
          }
          .header-left { display: flex; flex-direction: column; gap: 10px; }
          .logo-wrap { display: flex; align-items: center; gap: 12px; }
          .logo { width: 52px; height: 52px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,.12); padding: 4px; }
          .logo-fallback {
            width: 52px; height: 52px;
            display: grid; place-items: center;
            border-radius: 6px;
            background: rgba(255,255,255,.15);
            font-size: 14px; font-weight: 800; letter-spacing: .05em; color: #fff;
          }
          .company-info { display: flex; flex-direction: column; gap: 2px; }
          .company-name { font-size: 16px; font-weight: 700; color: #fff; }
          .company-reg { font-size: 10px; color: rgba(255,255,255,.65); }
          .company-contact { font-size: 10px; color: rgba(255,255,255,.7); }

          /* ── Document title block (top-right of header) ── */
          .header-right { text-align: right; }
          .doc-type {
            font-size: 28px;
            font-weight: 800;
            letter-spacing: .06em;
            color: #ffffff;
            line-height: 1;
          }
          .doc-number {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255,255,255,.8);
            margin-top: 4px;
          }
          .doc-status {
            display: inline-block;
            margin-top: 8px;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            background: ${statusStyle.primaryHex};
            color: #fff;
            letter-spacing: .04em;
            text-transform: uppercase;
          }

          /* ── Meta band (dates etc.) ── */
          .meta-band {
            background: ${BRAND_LIGHT};
            border-bottom: 1px solid #d1dff5;
            padding: 12px 32px;
            display: flex;
            gap: 32px;
            flex-wrap: wrap;
          }
          .meta-row { display: flex; flex-direction: column; gap: 1px; }
          .meta-label { font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
          .meta-value { font-size: 12px; font-weight: 700; color: ${BRAND}; }

          /* ── Body ── */
          .body { padding: 28px 32px; flex: 1; }

          /* ── Bill-to section ── */
          .bill-section { margin-bottom: 24px; }
          .section-label {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: ${ACCENT};
            border-bottom: 2px solid ${ACCENT};
            padding-bottom: 4px;
            margin-bottom: 8px;
            display: inline-block;
          }
          .bill-name { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
          .bill-detail { font-size: 11px; color: #475569; line-height: 1.6; }

          /* ── Document title ── */
          .doc-title-section { margin-bottom: 20px; }
          .doc-title {
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            text-transform: uppercase;
            letter-spacing: .04em;
            padding: 10px 14px;
            background: #f8fafc;
            border-left: 4px solid ${ACCENT};
            border-radius: 0 6px 6px 0;
          }

          /* ── Items table ── */
          .items-wrapper { overflow-x: auto; margin-bottom: 24px; }
          table.items { width: 100%; border-collapse: collapse; min-width: 480px; }
          .items thead tr {
            background: ${BRAND};
            color: #fff;
          }
          .items th {
            padding: 10px 12px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .06em;
            text-align: left;
          }
          .items td {
            padding: 10px 12px;
            font-size: 11px;
            vertical-align: top;
            border-bottom: 1px solid #e2e8f0;
          }
          .row-even { background: #ffffff; }
          .row-odd  { background: #f8fafc; }
          .items th:first-child, .items td:first-child { width: 32px; }
          .items th:nth-child(3), .items td:nth-child(3) { width: 110px; text-align: right; }
          .items th:nth-child(4), .items td:nth-child(4) { width: 90px; }
          .items th:nth-child(5), .items td:nth-child(5) { width: 110px; text-align: right; }
          .desc-cell { white-space: normal; }
          .item-name { font-weight: 600; color: #0f172a; }
          .item-desc { font-size: 10px; color: #64748b; margin-top: 3px; line-height: 1.4; }
          .num { color: #94a3b8; font-size: 10px; }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: 700; }

          /* ── Totals card ── */
          .totals-wrap { flex-shrink: 0; margin-left: auto; }
          .summary-row { display: flex; align-items: flex-start; gap: 24px; margin-bottom: 28px; }
          .summary-row .notes-section { flex: 1; min-width: 0; margin-bottom: 0; }
          .totals-card {
            width: 300px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            overflow: hidden;
          }
          .totals-card table { width: 100%; border-collapse: collapse; }
          .totals-card td { padding: 9px 16px; font-size: 12px; }
          .totals-card tr:not(:last-child) td { border-bottom: 1px solid #f1f5f9; }
          .totals-card .label-col { color: #64748b; }
          .totals-card .amount-col { text-align: right; font-weight: 600; }
          .total-row { background: ${BRAND}; }
          .total-row td { color: #fff; font-size: 13px; font-weight: 800; padding: 12px 16px; }

          /* ── Notes ── */
          .notes-section { margin-bottom: 24px; }
          .notes-box {
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 8px;
            padding: 14px 16px;
            font-size: 11px;
            color: #78350f;
            line-height: 1.6;
            white-space: normal;
          }
          .notes-box strong { display: block; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }

          /* ── Footer ── */
          .footer {
            background: ${BRAND_LIGHT};
            border-top: 1px solid #d1dff5;
            padding: 16px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: #64748b;
          }
          .footer-company { font-weight: 600; color: ${BRAND}; }
          .footer-thanks { font-style: italic; color: #94a3b8; }

          /* ── Print overrides ── */
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; background: #fff; }
            .page { width: 100%; min-height: auto; margin: 0; box-shadow: none; }
          }

          @media screen and (max-width: 640px) {
            .page { width: 100%; margin: 0 auto; box-shadow: none; }
            .header { padding: 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
            .header-left { flex: 1; max-width: 60%; }
            .logo { width: 42px; height: 42px; }
            .logo-fallback { width: 42px; height: 42px; font-size: 12px; }
            .company-name { font-size: 13px; }
            .company-reg, .company-contact { font-size: 9.5px; word-break: break-word; }
            .header-right { text-align: right; flex-shrink: 0; }
            .doc-type { font-size: 18px; }
            .doc-number { font-size: 11px; }
            .doc-status { font-size: 9px; padding: 2px 8px; }
            .meta-band { padding: 8px 16px; gap: 14px; }
            .body { padding: 16px; }
            table.items { font-size: 10px; min-width: 100%; }
            .items th { padding: 6px 6px; font-size: 9px; }
            .items td { padding: 6px 6px; font-size: 9.5px; }
            .items th:nth-child(3), .items td:nth-child(3) { width: 70px; }
            .items th:nth-child(4), .items td:nth-child(4) { width: 50px; }
            .items th:nth-child(5), .items td:nth-child(5) { width: 70px; }
            .summary-row { flex-direction: column; gap: 14px; }
            .totals-wrap { width: 100%; margin-left: auto; }
            .totals-card { width: 100%; max-width: 260px; margin-left: auto; }
            .footer { flex-direction: column; gap: 6px; padding: 12px 16px; text-align: center; }
          }
        </style>
      </head>
      <body>
        <div class="page">

          <!-- ── Header ── -->
          <header class="header">
            <div class="header-left">
              <div class="logo-wrap">
                ${
                  logoUrl
                    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)} logo" />`
                    : `<div class="logo-fallback">${escapeHtml(companyInitials)}</div>`
                }
                <div class="company-info">
                  <div class="company-name">${escapeHtml(companyName)}</div>
                  ${companyRegNo ? `<div class="company-reg">${escapeHtml(companyRegNo)}</div>` : ""}
                  ${company?.company_address ? `<div class="company-contact">${escapeHtml(company.company_address)}</div>` : ""}
                  ${company?.company_email || company?.phone_number ? `<div class="company-contact">${escapeHtml([company.company_email, company.phone_number].filter(Boolean).join("  |  "))}</div>` : ""}
                </div>
              </div>
            </div>
            <div class="header-right">
              <div class="doc-type">${escapeHtml(typeLabel)}</div>
              <div class="doc-number"># ${escapeHtml(document.docno)}</div>
              <div class="doc-status">${escapeHtml(document.status)}</div>
            </div>
          </header>

          <!-- ── Date meta band ── -->
          <div class="meta-band">
            ${dateRows}
          </div>

          <!-- ── Body ── -->
          <div class="body">

            <!-- Bill to -->
            <div class="bill-section">
              <div class="section-label">${escapeHtml(billLabel)}</div>
              <div class="bill-name">${escapeHtml(clientDetails.companyName || clientDetails.name)}</div>
              <div class="bill-detail">
                ${clientLines || "<em>No client details</em>"}
              </div>
            </div>

            <!-- Document title -->
            <div class="doc-title-section">
              <div class="doc-title">${escapeHtml(document.title)}</div>
            </div>

            <!-- Items table -->
            <div class="items-wrapper">
              <table class="items">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item / Description</th>
                    <th class="right">Unit Price</th>
                    <th class="center">Qty</th>
                    <th class="right">Amount (${escapeHtml(currency)})</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || `<tr><td colspan="5" class="center" style="color:#94a3b8;padding:24px">No line items</td></tr>`}
                </tbody>
              </table>
            </div>

            <!-- Totals card -->
            <!-- Remarks + Totals side-by-side -->
            <div class="summary-row">
              ${
                document.remark
                  ? `<div class="notes-section"><div class="section-label">Remarks</div><div class="notes-box">${formatMultiline(document.remark)}</div></div>`
                  : `<div></div>`
              }
              <div class="totals-wrap">
                <div class="totals-card">
                  <table>
                    <tr><td class="label-col">Subtotal</td><td class="amount-col">${escapeHtml(currency)} ${formatMoney(calculation.subtotal)}</td></tr>
                    <tr><td class="label-col">Discount</td><td class="amount-col">− ${escapeHtml(currency)} ${formatMoney(calculation.discount)}</td></tr>
                    <tr><td class="label-col">Tax</td><td class="amount-col">${escapeHtml(currency)} ${formatMoney(calculation.tax_total)}</td></tr>
                    <tr><td class="label-col">Shipping</td><td class="amount-col">${escapeHtml(currency)} ${formatMoney(calculation.shipping)}</td></tr>
                    <tr class="total-row"><td>TOTAL DUE</td><td class="amount-col">${escapeHtml(currency)} ${formatMoney(calculation.final_total)}</td></tr>
                  </table>
                </div>
              </div>
            </div>

          </div><!-- /body -->

          <!-- ── Footer ── -->
          <footer class="footer">
            <span class="footer-company">${escapeHtml(companyName)}${companyRegNo ? ` ${escapeHtml(companyRegNo)}` : ""}</span>
            <span class="footer-thanks">Thank you for your business!</span>
          </footer>

        </div>
      </body>
    </html>
  `
}
