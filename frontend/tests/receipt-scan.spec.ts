import { expect, test } from "@playwright/test"

import { parseReceiptText } from "../src/lib/receiptParser"

// Pure, deterministic tests for the OCR text -> fields mapping. These do not
// require the browser, network, or a running backend.
test.describe("parseReceiptText", () => {
  test("extracts the largest total amount", () => {
    const text = [
      "ACME HARDWARE",
      "Item A 12.00",
      "Item B 8.50",
      "Subtotal 20.50",
      "TOTAL 21.75",
    ].join("\n")

    const result = parseReceiptText(text)
    expect(result.amount).toBe(21.75)
  })

  test("normalizes a YYYY/MM/DD date", () => {
    const result = parseReceiptText("Date: 2026/03/09\nTOTAL 5.00")
    expect(result.date).toBe("2026-03-09")
  })

  test("normalizes a DD/MM/YY date with century expansion", () => {
    const result = parseReceiptText("15/04/26\nTOTAL 5.00")
    expect(result.date).toBe("2026-04-15")
  })

  test("uses the first plausible line as the vendor", () => {
    const result = parseReceiptText("Corner Cafe\nReceipt\n123 Main St\n9.90")
    expect(result.vendor).toBe("Corner Cafe")
  })

  test("returns an empty object for unrecognizable text", () => {
    const result = parseReceiptText("")
    expect(result.amount).toBeUndefined()
    expect(result.date).toBeUndefined()
    expect(result.vendor).toBeUndefined()
  })
})
