import { buildTransaction, buildWealthSnapshot } from "@/test/factories"

import { availableReviewYears, buildYearReviewStats, defaultReviewYear } from "./stats"

describe("year-review stats", () => {
  it("returns zeros and nulls for an empty year", () => {
    const stats = buildYearReviewStats(2025, [], [])

    expect(stats).toEqual({
      year: 2025,
      transactionCount: 0,
      incomeMinor: 0,
      expenseMinor: 0,
      savingsMinor: 0,
      savingsRate: null,
      topCategories: [],
      biggestMonth: null,
      netWorthStartMinor: null,
      netWorthEndMinor: null,
      netWorthDeltaMinor: null,
    })
  })

  it("summarizes a single transaction", () => {
    const stats = buildYearReviewStats(
      2025,
      [
        buildTransaction({
          id: "only",
          date: "2025-06-15",
          amountMinor: -5_000,
          category: "Dining",
        }),
      ],
      [],
    )

    expect(stats.transactionCount).toBe(1)
    expect(stats.incomeMinor).toBe(0)
    expect(stats.expenseMinor).toBe(5_000)
    expect(stats.savingsMinor).toBe(-5_000)
    expect(stats.savingsRate).toBeNull()
    expect(stats.topCategories).toEqual([{ category: "Dining", amountMinor: 5_000, share: 1 }])
    expect(stats.biggestMonth).toEqual({ month: "2025-06", expenseMinor: 5_000 })
  })

  it("ignores transactions outside the requested year", () => {
    const transactions = [
      buildTransaction({ id: "prev", date: "2024-12-31", amountMinor: -9_999_00 }),
      buildTransaction({
        id: "income",
        date: "2025-01-05",
        amountMinor: 200_000,
        category: "Income",
        transactionType: "Credit",
      }),
      buildTransaction({ id: "spend", date: "2025-03-10", amountMinor: -50_000, category: "Rent" }),
      buildTransaction({ id: "next", date: "2026-01-01", amountMinor: -1_00, category: "Snacks" }),
    ]

    const stats = buildYearReviewStats(2025, transactions, [])

    expect(stats.transactionCount).toBe(2)
    expect(stats.incomeMinor).toBe(200_000)
    expect(stats.expenseMinor).toBe(50_000)
    expect(stats.savingsMinor).toBe(150_000)
    expect(stats.savingsRate).toBeCloseTo(0.75)
    expect(stats.topCategories.map((entry) => entry.category)).toEqual(["Rent"])
  })

  it("ranks the top three categories and the biggest spending month", () => {
    const transactions = [
      buildTransaction({ id: "a", date: "2025-01-10", amountMinor: -30_000, category: "Rent" }),
      buildTransaction({
        id: "b",
        date: "2025-02-10",
        amountMinor: -10_000,
        category: "Groceries",
      }),
      buildTransaction({ id: "c", date: "2025-02-11", amountMinor: -20_000, category: "Dining" }),
      buildTransaction({ id: "d", date: "2025-03-10", amountMinor: -5_000, category: "Travel" }),
      buildTransaction({ id: "e", date: "2025-03-11", amountMinor: -1_000, category: null }),
    ]

    const stats = buildYearReviewStats(2025, transactions, [])

    expect(stats.topCategories.map((entry) => entry.category)).toEqual([
      "Rent",
      "Dining",
      "Groceries",
    ])
    expect(stats.topCategories[0]?.share).toBeCloseTo(30_000 / 66_000)
    expect(stats.biggestMonth).toEqual({ month: "2025-01", expenseMinor: 30_000 })
  })

  it("uses transaction types for absolute Credit Karma style amounts", () => {
    const transactions = [
      buildTransaction({
        id: "debit",
        date: "2025-04-01",
        amountMinor: 4_250,
        transactionType: "debit",
        category: "Groceries",
      }),
      buildTransaction({
        id: "credit",
        date: "2025-04-02",
        amountMinor: 100_000,
        transactionType: "credit",
        category: "Income",
      }),
    ]

    const stats = buildYearReviewStats(2025, transactions, [])

    expect(stats.incomeMinor).toBe(100_000)
    expect(stats.expenseMinor).toBe(4_250)
  })

  it("computes the net-worth start-to-end delta within the year only", () => {
    const wealth = [
      buildWealthSnapshot({ id: "prior", date: "2024-12-31", valueMinor: 1_000_00 }),
      buildWealthSnapshot({ id: "start", date: "2025-01-31", valueMinor: 10_000_00 }),
      buildWealthSnapshot({ id: "end", date: "2025-12-31", valueMinor: 13_500_00 }),
      buildWealthSnapshot({ id: "later", date: "2026-01-31", valueMinor: 99_000_00 }),
      buildWealthSnapshot({
        id: "invest",
        series: "investment",
        date: "2025-06-30",
        valueMinor: 5_000_00,
      }),
    ]

    const stats = buildYearReviewStats(2025, [], wealth)

    expect(stats.netWorthStartMinor).toBe(10_000_00)
    expect(stats.netWorthEndMinor).toBe(13_500_00)
    expect(stats.netWorthDeltaMinor).toBe(3_500_00)
  })

  it("leaves the net-worth delta null with a single observation", () => {
    const stats = buildYearReviewStats(
      2025,
      [],
      [buildWealthSnapshot({ date: "2025-06-30", valueMinor: 7_000_00 })],
    )

    expect(stats.netWorthStartMinor).toBe(7_000_00)
    expect(stats.netWorthEndMinor).toBe(7_000_00)
    expect(stats.netWorthDeltaMinor).toBeNull()
  })

  it("derives picker years from transaction dates plus the current year", () => {
    const transactions = [
      buildTransaction({ id: "a", date: "2024-12-31" }),
      buildTransaction({ id: "b", date: "2025-01-01" }),
      buildTransaction({ id: "c", date: "2025-06-01" }),
    ]

    expect(availableReviewYears(transactions, 2026)).toEqual([2026, 2025, 2024])
    expect(availableReviewYears([], 2026)).toEqual([2026])
  })

  it("defaults to the most recent year with data", () => {
    const transactions = [
      buildTransaction({ id: "a", date: "2024-12-31" }),
      buildTransaction({ id: "b", date: "2025-01-01" }),
    ]

    expect(defaultReviewYear(transactions, 2026)).toBe(2025)
    expect(defaultReviewYear([], 2026)).toBe(2026)
  })
})
