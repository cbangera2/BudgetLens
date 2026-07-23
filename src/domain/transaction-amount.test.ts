import { normalizeTransactionAmountMinor, transactionDirection } from "./transaction-amount"

describe("transaction amount normalization", () => {
  it.each([
    ["debit", "debit"],
    ["Expense", "debit"],
    ["PAYMENT", "debit"],
    ["credit", "credit"],
    ["Income", "credit"],
    [" refund ", "credit"],
    ["transfer", null],
    [null, null],
  ] as const)("classifies %s", (type, expected) => {
    expect(transactionDirection(type)).toBe(expected)
  })

  it("uses known types to sign absolute amounts and preserves unknown types", () => {
    expect(normalizeTransactionAmountMinor(4_250, "debit")).toBe(-4_250)
    expect(normalizeTransactionAmountMinor(-4_250, "debit")).toBe(-4_250)
    expect(normalizeTransactionAmountMinor(-10_000, "credit")).toBe(10_000)
    expect(normalizeTransactionAmountMinor(-500, "transfer")).toBe(-500)
  })
})
