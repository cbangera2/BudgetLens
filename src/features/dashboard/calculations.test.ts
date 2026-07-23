import type { BudgetGoal } from "@/domain/models"
import { buildTransaction } from "@/test/factories"

import {
  calculateBudgetProgress,
  calculateCategorySpending,
  calculateMetrics,
  calculateMonthlyCashFlow,
} from "./calculations"

const transactions = [
  buildTransaction({
    id: "income",
    date: "2026-01-02",
    amountMinor: 300_000,
    category: "Income",
    transactionType: "Credit",
  }),
  buildTransaction({ id: "food", date: "2026-01-03", amountMinor: -25_00, category: "Dining" }),
  buildTransaction({ id: "food-2", date: "2026-01-04", amountMinor: -75_00, category: "Dining" }),
  buildTransaction({ id: "rent", date: "2026-02-01", amountMinor: -100_000, category: "Housing" }),
]

describe("dashboard calculations", () => {
  it("centralizes income, expenses, savings, and the savings rate", () => {
    expect(calculateMetrics(transactions)).toEqual({
      incomeMinor: 300_000,
      expenseMinor: 110_000,
      savingsMinor: 190_000,
      savingsRate: 190_000 / 300_000,
      transactionCount: 4,
    })
    expect(calculateMetrics([buildTransaction({ amountMinor: -100 })]).savingsRate).toBeNull()
  })

  it("uses Credit Karma transaction types when imported amounts are absolute", () => {
    const absoluteAmounts = [
      buildTransaction({
        id: "debit",
        amountMinor: 4_250,
        transactionType: "debit",
        category: "Groceries",
      }),
      buildTransaction({ id: "credit", amountMinor: 100_000, transactionType: "CREDIT" }),
    ]

    expect(calculateMetrics(absoluteAmounts)).toMatchObject({
      incomeMinor: 100_000,
      expenseMinor: 4_250,
      savingsMinor: 95_750,
    })
    expect(calculateCategorySpending(absoluteAmounts)).toEqual([
      { category: "Groceries", amountMinor: 4_250, share: 1 },
    ])
  })

  it("aggregates sorted monthly cash flow", () => {
    expect(
      calculateMonthlyCashFlow(transactions).map(({ month, expenseMinor }) => [
        month,
        expenseMinor,
      ]),
    ).toEqual([
      ["2026-01", 10_000],
      ["2026-02", 100_000],
    ])
  })

  it("sorts category spending and assigns uncategorized expenses", () => {
    const result = calculateCategorySpending([
      ...transactions,
      buildTransaction({ id: "misc", amountMinor: -500, category: null }),
    ])
    expect(result.map(({ category, amountMinor }) => [category, amountMinor])).toEqual([
      ["Housing", 100_000],
      ["Dining", 10_000],
      ["Uncategorized", 500],
    ])
  })

  it("calculates monthly and yearly budget progress with explicit states", () => {
    const goal: BudgetGoal = {
      id: "goal",
      category: "Dining",
      amountMinor: 8_000,
      period: "monthly",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    expect(calculateBudgetProgress(goal, transactions, "2026-01-31")).toMatchObject({
      spentMinor: 10_000,
      remainingMinor: -2_000,
      progress: 1.25,
      status: "over-budget",
    })
  })
})
