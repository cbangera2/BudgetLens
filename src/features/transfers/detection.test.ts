import { buildTransaction } from "@/test/factories"

import {
  detectTransferPairs,
  isPotentialTransferPair,
  spendingExcludingTransfers,
  TRANSFER_AMOUNT_TOLERANCE_MINOR,
  TRANSFER_DATE_WINDOW_DAYS,
} from "./detection"

function transferOut(overrides: Parameters<typeof buildTransaction>[0] = {}) {
  return buildTransaction({
    id: "out",
    date: "2026-03-01",
    description: "Synthetic transfer out",
    amountMinor: -25_000,
    category: "Transfer",
    transactionType: "Debit",
    accountName: "Everyday Checking",
    ...overrides,
  })
}

function transferIn(overrides: Parameters<typeof buildTransaction>[0] = {}) {
  return buildTransaction({
    id: "in",
    date: "2026-03-02",
    description: "Synthetic transfer in",
    amountMinor: 25_000,
    category: "Transfer",
    transactionType: "Credit",
    accountName: "Beacon Savings",
    ...overrides,
  })
}

describe("transfer detection", () => {
  it("flags an exact opposite-signed pair across accounts", () => {
    const pairs = detectTransferPairs([transferOut(), transferIn()])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ expenseId: "out", incomeId: "in" })
    expect(isPotentialTransferPair(transferOut(), transferIn())).toBe(true)
  })

  it("matches at the tolerance boundary and rejects just outside it", () => {
    const within = transferIn({ amountMinor: 25_000 + TRANSFER_AMOUNT_TOLERANCE_MINOR })
    const outside = transferIn({
      id: "outside",
      amountMinor: 25_000 + TRANSFER_AMOUNT_TOLERANCE_MINOR + 1,
    })
    expect(isPotentialTransferPair(transferOut(), within)).toBe(true)
    expect(isPotentialTransferPair(transferOut(), outside)).toBe(false)
    expect(detectTransferPairs([transferOut(), outside])).toHaveLength(0)
  })

  it("matches at the date window edge and rejects beyond it", () => {
    const edge = transferIn({ date: "2026-03-05" })
    expect(edge.date).toBe("2026-03-05")
    expect(TRANSFER_DATE_WINDOW_DAYS).toBe(4)
    expect(isPotentialTransferPair(transferOut(), edge)).toBe(true)
    const beyond = transferIn({ id: "beyond", date: "2026-03-06" })
    expect(isPotentialTransferPair(transferOut(), beyond)).toBe(false)
  })

  it("excludes pairs on the same account", () => {
    const sameAccount = transferIn({ accountName: "Everyday Checking" })
    expect(isPotentialTransferPair(transferOut(), sameAccount)).toBe(false)
    expect(detectTransferPairs([transferOut(), sameAccount])).toHaveLength(0)
  })

  it("matches each transaction at most once when candidates are ambiguous", () => {
    const first = transferIn({ id: "in-1", date: "2026-03-02" })
    const second = transferIn({ id: "in-2", date: "2026-03-04" })
    const pairs = detectTransferPairs([transferOut(), first, second])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.incomeId).toBe("in-1")
  })

  it("treats a same-account refund as a refund, not a transfer", () => {
    const purchase = buildTransaction({
      id: "purchase",
      date: "2026-03-01",
      description: "Synthetic Bookstore",
      amountMinor: -1_999,
      category: "Shopping",
      accountName: "Everyday Checking",
    })
    const refund = buildTransaction({
      id: "refund",
      date: "2026-03-03",
      description: "Synthetic Bookstore refund",
      amountMinor: 1_999,
      category: "Shopping",
      accountName: "Everyday Checking",
    })
    expect(isPotentialTransferPair(purchase, refund)).toBe(false)
    expect(detectTransferPairs([purchase, refund, transferOut(), transferIn()])).toHaveLength(1)
  })

  it("requires opposite signs and different rows", () => {
    const row = transferOut()
    expect(isPotentialTransferPair(row, row)).toBe(false)
    const sameSign = transferIn({ id: "same", amountMinor: -25_000, transactionType: "Debit" })
    expect(isPotentialTransferPair(transferOut(), sameSign)).toBe(false)
  })

  it("excludes confirmed transfers from spending while keeping the rows", () => {
    const grocery = buildTransaction({
      id: "grocery",
      date: "2026-03-05",
      description: "Synthetic Groceries",
      amountMinor: -4_250,
      accountName: "Everyday Checking",
    })
    const rows = [transferOut(), transferIn(), grocery]
    const confirmed = new Set(["out", "in"])
    const totals = spendingExcludingTransfers(rows, confirmed)
    expect(totals.spendingMinor).toBe(4_250)
    expect(totals.excludedMinor).toBe(25_000)
    expect(totals.excludedCount).toBe(2)
    expect(spendingExcludingTransfers(rows, new Set()).spendingMinor).toBe(29_250)
  })
})
