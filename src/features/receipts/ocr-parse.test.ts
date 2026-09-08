// Unit tests for receipt OCR candidate parsing (synthetic OCR lines only).

import { describe, expect, it } from "vitest"

import {
  OCR_REVIEW_THRESHOLD,
  parseMoneyToken,
  parseReceiptOcr,
} from "@/features/receipts/ocr-parse"

const STANDARD_RECEIPT = [
  "Sunny Grocers",
  "123 Market Street",
  "08/15/2026 10:24 AM",
  "Milk 2.99",
  "Bread 3.49",
  "Subtotal 6.48",
  "Tax 0.52",
  "TOTAL $7.00",
  "Thank you!",
]

describe("parseReceiptOcr standard receipt", () => {
  it("extracts merchant, total, and date with show-your-work spans", () => {
    const result = parseReceiptOcr(STANDARD_RECEIPT)
    expect(result.merchant.value).toBe("Sunny Grocers")
    expect(result.merchant.level).toBe("high")
    expect(result.merchant.spans).toEqual(["Sunny Grocers"])
    expect(result.amountMinor.value).toBe(-700)
    expect(result.amountMinor.level).toBe("high")
    expect(result.amountMinor.spans).toEqual(["TOTAL $7.00"])
    expect(result.date.value).toBe("2026-08-15")
    expect(result.date.spans).toEqual(["08/15/2026 10:24 AM"])
    // 08/15 is unambiguous (15 cannot be a month), so the whole draft is confident.
    expect(result.date.level).toBe("high")
    expect(result.lowConfidence).toBe(false)
    expect(result.lineCount).toBe(STANDARD_RECEIPT.length)
  })
})

describe("parseReceiptOcr missing fields", () => {
  it("flags empty OCR output as missing everything", () => {
    const result = parseReceiptOcr([])
    expect(result.merchant.level).toBe("missing")
    expect(result.amountMinor.level).toBe("missing")
    expect(result.date.level).toBe("missing")
    expect(result.lowConfidence).toBe(true)
    expect(result.lineCount).toBe(0)
  })

  it("reports a missing total while keeping merchant and date", () => {
    const result = parseReceiptOcr(["Sunny Grocers", "2026-08-15", "See cashier for total"])
    expect(result.merchant.value).toBe("Sunny Grocers")
    expect(result.amountMinor.value).toBeNull()
    expect(result.amountMinor.level).toBe("missing")
    expect(result.amountMinor.note).toMatch(/no amount/i)
    expect(result.date.value).toBe("2026-08-15")
    expect(result.lowConfidence).toBe(true)
  })

  it("reports a missing date while keeping merchant and total", () => {
    const result = parseReceiptOcr(["Sunny Grocers", "TOTAL 12.00"])
    expect(result.date.value).toBeNull()
    expect(result.date.level).toBe("missing")
    expect(result.amountMinor.value).toBe(-1200)
    expect(result.lowConfidence).toBe(true)
  })

  it("reports a missing merchant when only amounts and dates are present", () => {
    const result = parseReceiptOcr(["08/15/2026", "TOTAL 12.00"])
    expect(result.merchant.value).toBeNull()
    expect(result.merchant.level).toBe("missing")
    expect(result.lowConfidence).toBe(true)
  })
})

describe("parseReceiptOcr low-confidence flagging", () => {
  it("is confident when every field is high confidence", () => {
    const result = parseReceiptOcr(["Sunny Grocers", "2026-08-15", "TOTAL $42.00"])
    expect(result.lowConfidence).toBe(false)
    expect(result.merchant.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.amountMinor.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.date.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it("flags fallback totals without a keyword for review", () => {
    const result = parseReceiptOcr(["Sunny Grocers", "2026-08-15", "Milk 2.99", "Bread 30.00"])
    expect(result.amountMinor.value).toBe(-3000)
    expect(result.amountMinor.level).toBe("low")
    expect(result.amountMinor.confidence).toBeLessThan(OCR_REVIEW_THRESHOLD)
    expect(result.lowConfidence).toBe(true)
  })

  it("flags ambiguous month-first numeric dates for review", () => {
    const result = parseReceiptOcr(["Sunny Grocers", "01/02/2026", "TOTAL 5.00"])
    expect(result.date.value).toBe("2026-01-02")
    expect(result.date.confidence).toBeLessThan(OCR_REVIEW_THRESHOLD)
    expect(result.date.note).toMatch(/ambiguous/i)
    expect(result.lowConfidence).toBe(true)
  })

  it("skips header lines to find the merchant with medium confidence", () => {
    const result = parseReceiptOcr(["RECEIPT", "Sunny Grocers", "TOTAL 5.00"])
    expect(result.merchant.value).toBe("Sunny Grocers")
    expect(result.merchant.level).toBe("medium")
    expect(result.lowConfidence).toBe(true)
  })
})

describe("parseReceiptOcr total selection", () => {
  it("prefers the total line over subtotal, tax, and savings lines", () => {
    const result = parseReceiptOcr([
      "Sunny Grocers",
      "Subtotal 100.00",
      "Total savings 20.00",
      "Tax 8.00",
      "TOTAL 88.00",
    ])
    expect(result.amountMinor.value).toBe(-8800)
    expect(result.amountMinor.spans).toEqual(["TOTAL 88.00"])
  })

  it("picks the largest amount among total lines", () => {
    const result = parseReceiptOcr(["Shop", "Total 10.00", "Grand Total 12.50"])
    expect(result.amountMinor.value).toBe(-1250)
  })

  it("matches amount-due and balance-due keyword variants", () => {
    expect(parseReceiptOcr(["Shop", "Amount due 21.40"]).amountMinor.value).toBe(-2140)
    expect(parseReceiptOcr(["Shop", "Balance due: $9.99"]).amountMinor.value).toBe(-999)
  })
})

describe("parseReceiptOcr currency and decimal variants", () => {
  it("parses thousands separators and currency symbols", () => {
    expect(parseMoneyToken("$1,234.56")).toMatchObject({ minor: 123456 })
    expect(parseMoneyToken("TOTAL: 1 234.56")).toMatchObject({ minor: 123456 })
    expect(parseMoneyToken("GBP 5.00")).toMatchObject({ minor: 500 })
  })

  it("parses comma decimals", () => {
    expect(parseMoneyToken("TOTAL 18,50")).toMatchObject({ minor: 1850 })
    expect(parseMoneyToken("1.234,56")).toMatchObject({ minor: 123456 })
    expect(parseMoneyToken("1,234")).toMatchObject({ minor: 123400 })
  })

  it("prefills totals as negative expense minor units", () => {
    const result = parseReceiptOcr(["Cafe Nero", "2026-03-04", "Total $1,234.56"])
    expect(result.amountMinor.value).toBe(-123456)
  })

  it("rejects lines without a parseable amount", () => {
    expect(parseMoneyToken("Thank you, come again")).toBeNull()
    expect(parseMoneyToken("Total: N/A")).toBeNull()
  })
})

describe("parseReceiptOcr date variants", () => {
  it("parses ISO, day-first, and written dates", () => {
    expect(parseReceiptOcr(["Shop", "2026-03-04", "TOTAL 5.00"]).date.value).toBe("2026-03-04")
    expect(parseReceiptOcr(["Shop", "25/12/2026", "TOTAL 5.00"]).date.value).toBe("2026-12-25")
    expect(parseReceiptOcr(["Shop", "Mar 4, 2026", "TOTAL 5.00"]).date.value).toBe("2026-03-04")
    expect(parseReceiptOcr(["Shop", "4 March 2026", "TOTAL 5.00"]).date.value).toBe("2026-03-04")
  })

  it("skips impossible dates and uses the next valid one", () => {
    const result = parseReceiptOcr(["Shop", "02/30/2026", "01/15/2026", "TOTAL 5.00"])
    expect(result.date.value).toBe("2026-01-15")
    expect(result.date.spans).toEqual(["01/15/2026"])
  })

  it("expands two-digit years", () => {
    expect(parseReceiptOcr(["Shop", "03/04/26", "TOTAL 5.00"]).date.value).toBe("2026-03-04")
  })
})
