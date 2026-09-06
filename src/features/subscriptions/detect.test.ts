import { buildTransaction } from "@/test/factories"

import { detectSubscriptions, normalizeMerchant } from "./detect"

function expense(id: string, date: string, description: string, amountMinor = -1500) {
  return buildTransaction({ id, date, description, amountMinor, transactionType: "Debit" })
}

describe("normalizeMerchant", () => {
  it("is case, whitespace, and punctuation insensitive", () => {
    expect(normalizeMerchant("  Acme Streaming, INC. ")).toBe("acme streaming inc")
    expect(normalizeMerchant("ACME-STREAMING!!")).toBe("acme streaming")
    expect(normalizeMerchant("acme   streaming")).toBe("acme streaming")
  })
})

describe("detectSubscriptions", () => {
  it("detects a monthly subscription", () => {
    const transactions = [
      expense("m1", "2026-01-15", "Acme Streaming"),
      expense("m2", "2026-02-15", "acme streaming "),
      expense("m3", "2026-03-15", "ACME-STREAMING!!"),
      expense("m4", "2026-04-15", "Acme Streaming"),
    ]
    const result = detectSubscriptions(transactions)
    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0]).toMatchObject({
      key: "acme streaming",
      occurrences: 4,
      cadence: "monthly",
    })
    expect(result.totalMonthlyBurnMinor).toBe(result.subscriptions[0]?.monthlyBurnMinor)
  })

  it("detects biweekly-ish cadence within tolerance", () => {
    const transactions = [
      expense("b1", "2026-01-01", "Example Gym", -2000),
      expense("b2", "2026-01-15", "Example Gym", -2000),
      expense("b3", "2026-01-29", "Example Gym", -2000),
      expense("b4", "2026-02-12", "Example Gym", -2000),
    ]
    const result = detectSubscriptions(transactions)
    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0]?.cadence).toBe("biweekly")
  })

  it("detects quarterly cadence", () => {
    const transactions = [
      expense("q1", "2025-04-15", "Example Cloud", -3000),
      expense("q2", "2025-07-15", "Example Cloud", -3000),
      expense("q3", "2025-10-15", "Example Cloud", -3000),
      expense("q4", "2026-01-15", "Example Cloud", -3000),
    ]
    const result = detectSubscriptions(transactions)
    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0]?.cadence).toBe("quarterly")
    expect(result.subscriptions[0]?.monthlyBurnMinor).toBe(993)
  })

  it("tolerates one missed month", () => {
    const transactions = [
      expense("s1", "2026-01-15", "Missed Merchant"),
      expense("s2", "2026-02-15", "Missed Merchant"),
      expense("s3", "2026-04-15", "Missed Merchant"),
      expense("s4", "2026-05-15", "Missed Merchant"),
    ]
    expect(detectSubscriptions(transactions).subscriptions).toHaveLength(1)
  })

  it("tolerates one missed month with only three occurrences", () => {
    const transactions = [
      expense("t1", "2026-01-15", "Sparse Merchant"),
      expense("t2", "2026-02-15", "Sparse Merchant"),
      expense("t3", "2026-04-15", "Sparse Merchant"),
    ]
    expect(detectSubscriptions(transactions).subscriptions).toHaveLength(1)
  })

  it("uses the median for a regular three-charge series", () => {
    const transactions = [
      expense("v1", "2026-01-01", "Regular Merchant", -3000),
      expense("v2", "2026-01-31", "Regular Merchant", -3000),
      expense("v3", "2026-03-07", "Regular Merchant", -3000),
    ]
    const result = detectSubscriptions(transactions)
    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0]?.medianIntervalDays).toBe(32.5)
    expect(result.subscriptions[0]?.monthlyBurnMinor).toBe(2810)
  })

  it("rejects irregular activity", () => {
    const transactions = [
      expense("i1", "2026-01-10", "Corner Deli"),
      expense("i2", "2026-01-12", "Corner Deli"),
      expense("i3", "2026-03-20", "Corner Deli"),
      expense("i4", "2026-04-25", "Corner Deli"),
    ]
    expect(detectSubscriptions(transactions).subscriptions).toHaveLength(0)
  })

  it("ignores refunds mixed in with expenses", () => {
    const transactions = [
      expense("r1", "2026-01-15", "Refund Merchant"),
      expense("r2", "2026-02-15", "Refund Merchant"),
      buildTransaction({
        id: "refund",
        date: "2026-02-20",
        description: "Refund Merchant",
        amountMinor: 1500,
        transactionType: "Credit",
      }),
      expense("r3", "2026-03-15", "Refund Merchant"),
      expense("r4", "2026-04-15", "Refund Merchant"),
    ]
    const result = detectSubscriptions(transactions)
    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0]?.occurrences).toBe(4)
  })

  it("excludes a single occurrence", () => {
    expect(
      detectSubscriptions([expense("once", "2026-01-15", "One-Time Shop")]).subscriptions,
    ).toHaveLength(0)
  })

  it("excludes merchants with only two occurrences", () => {
    const transactions = [
      expense("w1", "2026-01-15", "Twice Merchant"),
      expense("w2", "2026-02-15", "Twice Merchant"),
    ]
    expect(detectSubscriptions(transactions).subscriptions).toHaveLength(0)
  })

  it("computes monthly burn from the median amount", () => {
    const transactions = [
      expense("a1", "2026-01-15", "Burn Merchant", -1200),
      expense("a2", "2026-02-15", "Burn Merchant", -1200),
      expense("a3", "2026-03-15", "Burn Merchant", -1800),
      expense("a4", "2026-04-15", "Burn Merchant", -1200),
    ]
    const result = detectSubscriptions(transactions)
    expect(result.subscriptions[0]?.medianAmountMinor).toBe(1200)
    expect(result.totalMonthlyBurnMinor).toBeGreaterThan(0)
  })
})
