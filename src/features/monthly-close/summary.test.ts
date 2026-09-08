import { buildTransaction } from "@/test/factories"

import {
  buildCloseVerdict,
  closeMonthMovers,
  formatCloseMover,
  previousCloseMonth,
  summarizeCloseMonth,
  uncategorizedForMonth,
} from "./summary"

function closingTransactions() {
  return [
    buildTransaction({
      id: "income-1",
      date: "2026-08-01",
      description: "Synthetic Paycheck",
      amountMinor: 200_000,
      category: "Income",
      transactionType: "Credit",
    }),
    buildTransaction({
      id: "expense-1",
      date: "2026-08-06",
      description: "Synthetic Corner Bakery",
      amountMinor: -8_50,
      category: null,
      transactionType: "Debit",
    }),
    buildTransaction({
      id: "expense-2",
      date: "2026-08-09",
      description: "Synthetic Book Nook",
      amountMinor: -21_99,
      category: "Shopping",
      transactionType: "Debit",
    }),
    buildTransaction({
      id: "other-month",
      date: "2026-07-09",
      description: "Synthetic Prior Spend",
      amountMinor: -5_00,
      category: "Shopping",
      transactionType: "Debit",
    }),
  ]
}

describe("summarizeCloseMonth", () => {
  it("scopes income, spending, savings rate, and top categories to the month", () => {
    const summary = summarizeCloseMonth(closingTransactions(), "2026-08")
    expect(summary.transactionCount).toBe(3)
    expect(summary.incomeMinor).toBe(200_000)
    expect(summary.expenseMinor).toBe(3_049)
    expect(summary.savingsMinor).toBe(200_000 - 3_049)
    expect(summary.savingsRate).toBeCloseTo((200_000 - 3_049) / 200_000)
    expect(summary.topCategories[0]).toMatchObject({ category: "Shopping" })
  })

  it("returns a null savings rate without income", () => {
    const summary = summarizeCloseMonth(
      [
        buildTransaction({
          id: "expense-only",
          date: "2026-08-10",
          description: "Synthetic Spend",
          amountMinor: -1_000,
          category: "Shopping",
          transactionType: "Debit",
        }),
      ],
      "2026-08",
    )
    expect(summary.savingsRate).toBeNull()
  })
})

describe("buildCloseVerdict", () => {
  it("writes one calm line for strong, calm, tight, and empty months", () => {
    const base = summarizeCloseMonth(closingTransactions(), "2026-08")
    expect(buildCloseVerdict(base)).toContain("2026-08")
    expect(buildCloseVerdict({ ...base, savingsRate: -0.1, transactionCount: 3 })).toContain(
      "Tight close",
    )
    expect(buildCloseVerdict({ ...base, transactionCount: 0 })).toContain("No activity")
    expect(buildCloseVerdict({ ...base, savingsRate: null })).toContain("No income")
  })
})

describe("closeMonthMovers", () => {
  it("rolls the previous month across a year boundary", () => {
    expect(previousCloseMonth("2026-08")).toBe("2026-07")
    expect(previousCloseMonth("2026-01")).toBe("2025-12")
  })

  it("compares closing month against the previous calendar month", () => {
    const transactions = [
      buildTransaction({
        id: "dining-july",
        date: "2026-07-10",
        description: "Synthetic Bistro",
        amountMinor: -10_00,
        category: "Dining",
        transactionType: "Debit",
      }),
      buildTransaction({
        id: "dining-august",
        date: "2026-08-10",
        description: "Synthetic Bistro",
        amountMinor: -30_00,
        category: "Dining",
        transactionType: "Debit",
      }),
      buildTransaction({
        id: "new-august",
        date: "2026-08-11",
        description: "Synthetic New Shop",
        amountMinor: -5_00,
        category: "Shopping",
        transactionType: "Debit",
      }),
    ]
    const { previousMonth, movers } = closeMonthMovers(transactions, "2026-08")
    expect(previousMonth).toBe("2026-07")
    expect(movers.map((mover) => mover.category)).toEqual(["Dining", "Shopping"])
    expect(movers[0]).toMatchObject({ currentMinor: 3000, previousMinor: 1000, deltaMinor: 2000 })
    expect(movers[1]).toMatchObject({ previousMinor: 0, percent: null })
    expect(formatCloseMover(movers[0]!)).toContain("Dining")
    expect(formatCloseMover(movers[1]!)).toContain("new vs")
  })

  it("returns no movers for a steady month", () => {
    const transactions = [
      buildTransaction({ id: "steady-1", date: "2026-07-10", amountMinor: -10_00 }),
      buildTransaction({ id: "steady-2", date: "2026-08-10", amountMinor: -10_00 }),
    ]
    expect(closeMonthMovers(transactions, "2026-08").movers).toEqual([])
  })
})

describe("uncategorizedForMonth", () => {
  it("returns only blank-category rows in the closing month", () => {
    const rows = uncategorizedForMonth(closingTransactions(), "2026-08")
    expect(rows.map((row) => row.id)).toEqual(["expense-1"])
  })

  it("already-clean month fast-path is an empty list", () => {
    const rows = uncategorizedForMonth(
      [
        buildTransaction({ id: "clean-1", date: "2026-08-05", category: "Groceries" }),
        buildTransaction({ id: "uncategorized-other-month", date: "2026-07-05", category: null }),
      ],
      "2026-08",
    )
    expect(rows).toEqual([])
  })
})
