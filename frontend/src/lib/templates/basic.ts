// Basic template — clean, professional, well-proportioned. No extra colours.

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
  getCompanyLines,
  getLineItems,
  getLogoUrl,
  getStatusStyle,
} from "./helpers"
import type { TemplateBuilderArgs } from "./types"

export function buildBasicTemplate({
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
  const companyName = company?.company_name ?? "Company"
  const companyRegNo = company?.registration_number
    ? `(${company.registration_number})`
    : ""
  const companyInitials = getCompanyInitials(company)
  const statusStyle = getStatusStyle(document.status)

  const billLabel = document.doctype === "paymentvoucher" ? "Pay To" : "Bill To"

  const rows = lineItems
    .map((item, index) => {
      const titleLines = item.title.split("\n")
      const itemName = escapeHtml(titleLines[0])
      const inlinedDesc = titleLines.slice(1).join("\n")
      const descText = inlinedDesc || item.description || null
      return `<tr>
          <td class="c num">${index + 1}</td>
          <td class="desc">${itemName}${descText ? `<div class="sub">${formatMultiline(descText)}</div>` : ""}</td>
          <td class="r">${formatMoney(item.unit_price)}</td>
          <td class="c">${formatQuantity(item.quantity)} ${escapeHtml(item.unit_type)}</td>
          <td class="r">${formatMoney(item.total)}</td>
        </tr>`
    })
    .join("")

  const companyLines = getCompanyLines(company)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("")

  const clientLines = [
    clientDetails.companyName || clientDetails.name,
    clientDetails.companyName &&
    clientDetails.name !== clientDetails.companyName
      ? clientDetails.name
      : "",
    clientDetails.regNumber ? `Reg No: ${clientDetails.regNumber}` : "",
    clientDetails.address,
    [clientDetails.email, clientDetails.phone].filter(Boolean).join("  |  "),
  ]
    .filter(Boolean)
    .map((line) => `<div>${formatMultiline(line)}</div>`)
    .join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(typeLabel)} ${escapeHtml(document.docno)}</title>
<style>
  @page { size: A4; margin: 16mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #f1f5f9;
    color: #111827;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 1.5;
  }
  .page {
    width: min(100%, 210mm);
    min-height: 297mm;
    margin: 24px auto;
    padding: 16mm 18mm;
    background: #fff;
    box-shadow: 0 8px 30px rgba(0,0,0,.12);
  }

  /* ── Header ── */
  .hdr {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 16px;
    border-bottom: 2px solid #111827;
    margin-bottom: 20px;
  }
  .brand { display: flex; flex-direction: column; gap: 10px; }
  .logo { width: 60px; height: 60px; object-fit: contain; }
  .logo-fallback {
    width: 52px; height: 52px;
    display: grid; place-items: center;
    border: 2px solid #111827;
    font-size: 13px; font-weight: 800; letter-spacing: .04em;
  }
  .co-name { font-size: 13px; font-weight: 700; line-height: 1.3; margin-bottom: 1px; }
  .co-reg  { font-size: 10.5px; color: #6b7280; }
  .co-contact { font-size: 10.5px; color: #6b7280; margin-top: 1px; }

  /* ── Document summary (top-right) ── */
  .doc-block { text-align: right; }
  .doc-type {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: .03em;
    text-transform: uppercase;
    line-height: 1;
    margin-bottom: 6px;
  }
  .doc-no { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 12px; }
  table.meta { border-collapse: collapse; margin-left: auto; }
  table.meta td { padding: 3px 0 3px 18px; font-size: 11px; }
  table.meta td:first-child { color: #6b7280; text-align: right; font-weight: 500; white-space: nowrap; }
  table.meta td:last-child  { font-weight: 700; text-align: right; }
  .status-cell { color: ${statusStyle.primaryHex}; }

  /* ── Bill-to / From row ── */
  .parties {
    display: flex;
    gap: 32px;
    margin-bottom: 20px;
  }
  .party { flex: 1; }
  .party-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #9ca3af;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 3px;
    margin-bottom: 5px;
  }
  .party-name { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
  .party-detail { font-size: 10.5px; color: #4b5563; line-height: 1.55; }

  /* ── Title bar ── */
  .doc-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    padding: 7px 0;
    margin-bottom: 14px;
    color: #111827;
  }

  /* ── Items table ── */
  .items-wrapper { overflow-x: auto; margin-bottom: 12px; }
  table.items { width: 100%; border-collapse: collapse; min-width: 480px; font-size: 11.5px; }
  .items thead tr { border-bottom: 2px solid #111827; }
  .items th {
    padding: 7px 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: #374151;
    text-align: left;
  }
  .items td {
    padding: 9px 8px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }
  .items th:first-child, .items td:first-child { width: 28px; }
  .items th:nth-child(3), .items td:nth-child(3) { width: 110px; text-align: right; }
  .items th:nth-child(4), .items td:nth-child(4) { width: 90px; text-align: center; }
  .items th:nth-child(5), .items td:nth-child(5) { width: 110px; text-align: right; }
  .num  { color: #9ca3af; font-size: 10px; }
  .desc { white-space: normal; font-weight: 600; }
  .sub  { margin-top: 2px; font-size: 10px; color: #6b7280; font-weight: 400; line-height: 1.4; }
  .c    { text-align: center; }
  .r    { text-align: right; }

  /* ── Bottom: notes + totals ── */
  .bottom-row { display: flex; align-items: flex-start; gap: 24px; margin-top: 16px; }
  .notes-col  { flex: 1; min-width: 0; }
  .notes-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #9ca3af;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 3px;
    margin-bottom: 6px;
  }
  .notes-text { font-size: 10.5px; color: #374151; line-height: 1.6; }

  /* ── Totals ── */
  .totals-col { flex-shrink: 0; width: 260px; margin-left: auto; }
  table.totals { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  table.totals td { padding: 5px 4px; }
  table.totals .lbl { color: #6b7280; }
  table.totals .amt { text-align: right; font-weight: 600; }
  tr.t-final { border-top: 2px solid #111827; }
  tr.t-final td { padding-top: 8px; font-size: 13px; font-weight: 800; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; background: #fff; }
    .page { width: 100%; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
  }
  @media screen and (max-width: 640px) {
    .page { width: 100%; padding: 12px 14px; margin: 0 auto; box-shadow: none; }
    .hdr { display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 14px; padding-bottom: 12px; }
    .brand { flex: 1; max-width: 58%; gap: 6px; }
    .logo { width: 44px; height: 44px; }
    .co-name { font-size: 11.5px; }
    .co-reg { font-size: 9.5px; }
    .co-contact { font-size: 9.5px; word-break: break-word; }
    .doc-block { text-align: right; flex-shrink: 0; }
    .doc-type { font-size: 16px; margin-bottom: 2px; }
    .doc-no { font-size: 10.5px; margin-bottom: 4px; }
    table.meta { margin-left: auto; }
    table.meta td { padding: 1.5px 0 1.5px 6px; font-size: 9.5px; }
    .parties { flex-direction: column; gap: 12px; margin-bottom: 14px; }
    .party-label { font-size: 8.5px; }
    .party-name { font-size: 11px; }
    .party-detail { font-size: 9.5px; word-break: break-word; }
    .doc-title { font-size: 10px; padding: 5px 0; margin-bottom: 10px; }
    table.items { font-size: 10px; min-width: 100%; }
    .items th { padding: 6px 4px; font-size: 9px; }
    .items td { padding: 6px 4px; font-size: 9.5px; }
    .items th:nth-child(3), .items td:nth-child(3) { width: 70px; }
    .items th:nth-child(4), .items td:nth-child(4) { width: 55px; }
    .items th:nth-child(5), .items td:nth-child(5) { width: 70px; }
    .bottom-row { flex-direction: column; gap: 14px; }
    .totals-col { width: 100%; max-width: 240px; margin-left: auto; }
    table.totals { font-size: 10.5px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- ── Header ── -->
  <div class="hdr">
    <div class="brand">
      ${
        logoUrl
          ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)} logo"/>`
          : `<div class="logo-fallback">${escapeHtml(companyInitials)}</div>`
      }
      <div>
        <div class="co-name">${escapeHtml(companyName)}</div>
        ${companyRegNo ? `<div class="co-reg">${escapeHtml(companyRegNo)}</div>` : ""}
        ${companyLines ? `<div class="co-contact">${companyLines}</div>` : ""}
      </div>
    </div>
    <div class="doc-block">
      <div class="doc-type">${escapeHtml(typeLabel)}</div>
      <div class="doc-no">#${escapeHtml(document.docno)}</div>
      <table class="meta">
        <tr><td>${escapeHtml(documentTypeLabel[document.doctype] ?? "Document")} Date</td><td>${escapeHtml(formatDateDMY(document.date))}</td></tr>
        ${document.validity ? `<tr><td>Valid Until</td><td>${escapeHtml(formatDateDMY(document.validity))}</td></tr>` : ""}
        ${document.duedate ? `<tr><td>Due Date</td><td>${escapeHtml(formatDateDMY(document.duedate))}</td></tr>` : ""}
        <tr><td>Status</td><td class="status-cell">${escapeHtml(document.status)}</td></tr>
      </table>
    </div>
  </div>

  <!-- ── Parties ── -->
  <div class="parties">
    <div class="party">
      <div class="party-label">From</div>
      <div class="party-name">${escapeHtml(companyName)}</div>
      ${getCompanyLines(company)
        .map((l) => `<div class="party-detail">${escapeHtml(l)}</div>`)
        .join("")}
    </div>
    <div class="party">
      <div class="party-label">${escapeHtml(billLabel)}</div>
      <div class="party-name">${escapeHtml(clientDetails.companyName || clientDetails.name)}</div>
      <div class="party-detail">${clientLines || "-"}</div>
    </div>
  </div>

  <!-- ── Document title ── -->
  <div class="doc-title">${escapeHtml(document.title)}</div>

  <!-- ── Items table ── -->
  <div class="items-wrapper">
    <table class="items">
      <thead>
        <tr>
          <th>#</th>
          <th>Item / Description</th>
          <th class="r">Unit Price</th>
          <th class="c">Quantity</th>
          <th class="r">Total (${escapeHtml(currency)})</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" class="c" style="padding:16px;color:#9ca3af">No line items</td></tr>`}
      </tbody>
    </table>
  </div>

  <!-- ── Bottom: notes + totals ── -->
  <div class="bottom-row">
    ${
      document.remark
        ? `<div class="notes-col"><div class="notes-label">Remarks</div><div class="notes-text">${formatMultiline(document.remark)}</div></div>`
        : `<div></div>`
    }
    <div class="totals-col">
      <table class="totals">
        <tr><td class="lbl">Subtotal (${escapeHtml(currency)})</td><td class="amt">${formatMoney(calculation.subtotal)}</td></tr>
        <tr><td class="lbl">Discount (${escapeHtml(currency)})</td><td class="amt">${formatMoney(calculation.discount)}</td></tr>
        <tr><td class="lbl">Tax (${escapeHtml(currency)})</td><td class="amt">${formatMoney(calculation.tax_total)}</td></tr>
        <tr><td class="lbl">Shipping (${escapeHtml(currency)})</td><td class="amt">${formatMoney(calculation.shipping)}</td></tr>
        <tr class="t-final"><td>Total Due (${escapeHtml(currency)})</td><td class="amt">${formatMoney(calculation.final_total)}</td></tr>
      </table>
    </div>
  </div>

</div>
</body>
</html>`
}
