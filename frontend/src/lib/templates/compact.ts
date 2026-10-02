// Compact Dense template — all document data in a tight, space-efficient layout.
// Smaller fonts, minimal padding, maximised information density.

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

export function buildCompactTemplate({
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
  const companyName = company?.company_name ?? "Company"
  const companyRegNo = company?.registration_number
    ? `(${company.registration_number})`
    : ""
  const statusStyle = getStatusStyle(document.status)

  // Company contact line
  const companyContact = [
    company?.company_address,
    [company?.company_email, company?.phone_number].filter(Boolean).join(" | "),
  ]
    .filter(Boolean)
    .join("  ·  ")

  // Client address — compact single-line-per-field
  const clientLines = [
    clientDetails.companyName || clientDetails.name,
    clientDetails.companyName &&
    clientDetails.name !== clientDetails.companyName
      ? clientDetails.name
      : "",
    clientDetails.regNumber ? `Reg: ${clientDetails.regNumber}` : "",
    clientDetails.address,
    [clientDetails.email, clientDetails.phone].filter(Boolean).join(" | "),
  ]
    .filter(Boolean)
    .map((line) => `<div>${formatMultiline(line)}</div>`)
    .join("")

  // Line item rows — ultra-compact
  const rows = lineItems
    .map((item, index) => {
      const titleLines = item.title.split("\n")
      const itemName = escapeHtml(titleLines[0])
      const inlinedDesc = titleLines.slice(1).join("\n")
      const descText = inlinedDesc || item.description || null
      return `<tr class="${index % 2 === 0 ? "r-e" : "r-o"}">
        <td class="c">${index + 1}</td>
        <td class="desc-cell">${itemName}${descText ? `<div class="sub">${formatMultiline(descText)}</div>` : ""}</td>
        <td class="r">${formatMoney(item.unit_price)}</td>
        <td class="c">${formatQuantity(item.quantity)} ${escapeHtml(item.unit_type)}</td>
        <td class="r b">${formatMoney(item.total)}</td>
      </tr>`
    })
    .join("")

  // Meta items (date, validity, due date, status)
  const metaItems = [
    [
      `${documentTypeLabel[document.doctype] ?? "Document"} Date`,
      formatDateDMY(document.date),
    ],
    document.validity
      ? ["Valid Until", formatDateDMY(document.validity)]
      : null,
    document.duedate ? ["Due Date", formatDateDMY(document.duedate)] : null,
    ["Status", document.status],
  ]
    .filter((x): x is [string, string] => x !== null)
    .map(
      ([label, value]) =>
        `<div class="meta-item"><span class="meta-k">${escapeHtml(label)}</span><span class="meta-v" style="${label === "Status" ? `color:${statusStyle.primaryHex}` : ""}">${escapeHtml(value)}</span></div>`,
    )
    .join("")

  const billLabel = document.doctype === "paymentvoucher" ? "Pay To" : "Bill To"

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(typeLabel)} ${escapeHtml(document.docno)}</title>
<style>
@page { size: A4; margin: 10mm 12mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #f5f5f5;
  color: #111;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  line-height: 1.35;
}
.page {
  width: min(100%, 210mm);
  min-height: 297mm;
  margin: 16px auto;
  background: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,.12);
  display: flex;
  flex-direction: column;
}

/* ── Header strip ── */
.hdr {
  padding: 10px 14px 8px;
  border-bottom: 2px solid #222;
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo { width: 36px; height: 36px; object-fit: contain; }
.logo-fb {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  background: #222; color: #fff;
  font-size: 9px; font-weight: 800;
  letter-spacing: .04em;
}
.co-block { flex: 1; }
.co-name { font-size: 12px; font-weight: 800; line-height: 1.2; }
.co-detail { font-size: 8.5px; color: #555; margin-top: 1px; }
.doc-block { text-align: right; }
.doc-type { font-size: 16px; font-weight: 900; letter-spacing: .04em; color: #111; line-height: 1; }
.doc-no { font-size: 9px; color: #555; margin-top: 2px; }

/* ── Meta row ── */
.meta-row {
  padding: 5px 14px;
  background: #f0f0f0;
  border-bottom: 1px solid #ddd;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.meta-item { display: flex; flex-direction: column; }
.meta-k { font-size: 7.5px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: .06em; }
.meta-v { font-size: 9.5px; font-weight: 700; color: #111; }

/* ── Body ── */
.body { padding: 10px 14px; flex: 1; }

/* ── Parties row ── */
.parties { display: flex; gap: 16px; margin-bottom: 8px; }
.party { flex: 1; }
.party-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: .06em; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 3px; }
.party-name { font-size: 10px; font-weight: 700; }
.party-detail { font-size: 8.5px; color: #444; line-height: 1.4; }

/* ── Title ── */
.doc-title-row {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  background: #f7f7f7;
  border: 1px solid #ddd;
  padding: 4px 8px;
  margin-bottom: 6px;
}

/* ── Items table ── */
.items-wrap { overflow-x: auto; margin-bottom: 8px; }
table.items { width: 100%; border-collapse: collapse; min-width: 420px; font-size: 9px; }
.items thead tr { background: #222; color: #fff; }
.items th { padding: 5px 6px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; text-align: left; }
.items td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
.r-e { background: #fff; }
.r-o { background: #fafafa; }
.items th:first-child, .items td:first-child { width: 20px; }
.items th:nth-child(3), .items td:nth-child(3) { width: 80px; text-align: right; }
.items th:nth-child(4), .items td:nth-child(4) { width: 70px; text-align: center; }
.items th:nth-child(5), .items td:nth-child(5) { width: 80px; text-align: right; }
.desc-cell { white-space: normal; font-size: 9px; }
.sub { font-size: 8px; color: #666; margin-top: 1px; }
.c { text-align: center; }
.r { text-align: right; }
.b { font-weight: 700; }

/* ── Bottom row: remarks + totals ── */
.bottom-row { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 8px; }
.remarks-box { flex: 1; min-width: 0; }
.section-lbl { font-size: 7.5px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: .06em; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 4px; }
.remark-text { font-size: 8.5px; color: #333; line-height: 1.5; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 3px; padding: 6px 8px; }
.totals-box { flex-shrink: 0; width: 220px; margin-left: auto; }
table.totals { width: 100%; border-collapse: collapse; font-size: 9px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
table.totals td { padding: 4px 8px; border-bottom: 1px solid #eee; }
table.totals tr:last-child td { border-bottom: none; }
.totals .lbl { color: #555; }
.totals .amt { text-align: right; font-weight: 600; }
.total-final { background: #222; color: #fff !important; font-size: 10px !important; font-weight: 800 !important; }
.total-final td { color: #fff !important; border-bottom: none !important; padding: 6px 8px !important; }

/* ── Footer ── */
.footer {
  border-top: 1px solid #ddd;
  padding: 5px 14px;
  display: flex;
  justify-content: space-between;
  font-size: 8px;
  color: #888;
}

@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; background: #fff; }
  .page { width: 100%; min-height: auto; margin: 0; box-shadow: none; }
}
@media screen and (max-width: 640px) {
  .page { width: 100%; margin: 0 auto; box-shadow: none; }
  .hdr { display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .co-block { flex: 1; max-width: 55%; }
  .co-name { font-size: 11px; }
  .co-detail { font-size: 8px; word-break: break-word; }
  .doc-block { text-align: right; flex-shrink: 0; }
  .doc-type { font-size: 14px; }
  .doc-no { font-size: 8.5px; }
  .parties { flex-direction: column; gap: 8px; }
  .party-detail { word-break: break-word; }
  table.items { min-width: 100%; }
  .bottom-row { flex-direction: column; gap: 10px; }
  .totals-box { width: 100%; max-width: 220px; margin-left: auto; }
}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="hdr">
    ${
      logoUrl
        ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)} logo"/>`
        : `<div class="logo-fb">${escapeHtml(companyInitials)}</div>`
    }
    <div class="co-block">
      <div class="co-name">${escapeHtml(companyName)} ${companyRegNo ? `<span style="font-weight:400;font-size:9px">${escapeHtml(companyRegNo)}</span>` : ""}</div>
      ${companyContact ? `<div class="co-detail">${escapeHtml(companyContact)}</div>` : ""}
    </div>
    <div class="doc-block">
      <div class="doc-type">${escapeHtml(typeLabel)}</div>
      <div class="doc-no">#${escapeHtml(document.docno)}</div>
    </div>
  </div>

  <!-- Meta strip -->
  <div class="meta-row">${metaItems}</div>

  <!-- Body -->
  <div class="body">

    <!-- Parties -->
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
        <div class="party-detail">${clientLines}</div>
      </div>
    </div>

    <!-- Document title -->
    <div class="doc-title-row">${escapeHtml(document.title)}</div>

    <!-- Items table -->
    <div class="items-wrap">
      <table class="items">
        <thead>
          <tr>
            <th>#</th>
            <th>Item / Description</th>
            <th class="r">Unit Price</th>
            <th class="c">Qty</th>
            <th class="r">Amount (${escapeHtml(currency)})</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5" class="c" style="padding:10px;color:#aaa">No line items</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- Bottom: remarks + totals side-by-side -->
    <div class="bottom-row">
      ${
        document.remark
          ? `<div class="remarks-box"><div class="section-lbl">Remarks</div><div class="remark-text">${formatMultiline(document.remark)}</div></div>`
          : `<div></div>`
      }
      <div class="totals-box">
        <div class="section-lbl">Summary</div>
        <table class="totals">
          <tr><td class="lbl">Subtotal</td><td class="amt">${escapeHtml(currency)} ${formatMoney(calculation.subtotal)}</td></tr>
          <tr><td class="lbl">Discount</td><td class="amt">− ${escapeHtml(currency)} ${formatMoney(calculation.discount)}</td></tr>
          <tr><td class="lbl">Tax</td><td class="amt">${escapeHtml(currency)} ${formatMoney(calculation.tax_total)}</td></tr>
          <tr><td class="lbl">Shipping</td><td class="amt">${escapeHtml(currency)} ${formatMoney(calculation.shipping)}</td></tr>
          <tr class="total-final"><td>TOTAL DUE</td><td class="amt">${escapeHtml(currency)} ${formatMoney(calculation.final_total)}</td></tr>
        </table>
      </div>
    </div>

  </div><!-- /body -->

  <!-- Footer -->
  <div class="footer">
    <span>${escapeHtml(companyName)}${companyRegNo ? ` ${escapeHtml(companyRegNo)}` : ""}</span>
    <span>Thank you for your business!</span>
  </div>

</div>
</body>
</html>`
}
