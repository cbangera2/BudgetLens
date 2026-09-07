import { describe, expect, it } from "vitest"

import type { BudgetGoal } from "@/domain/models"
import { detectSubscriptions } from "@/features/subscriptions/detect"
import { buildTransaction } from "@/test/factories"

import { addDaysIso, projectCashflow } from "./projection"

function expense(id: string, date: string, description: string, amountMinor = -1500) {
  return buildTransaction({ id, date, description, amountMinor, transactionType: "Debit" })
}

function income(id: string, date: string, amountMinor: number) {
  return buildTransaction({
    id,
    date,
    description: "Example Paycheck",
    amountMinor,
    category: "Income",
    transactionType: "Credit",
  })
}

function goal(category: string, amountMinor: number, period: BudgetGoal["period"] = "monthly") {
  return {
    id: `goal-${category}`,
    category,
    amountMinor,
    period,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies BudgetGoal
}

describe("projectCashflow", () => {
  it("returns a flat zero forecast for empty history with no recurring or budgets", () => {
    const result = projectCashflow({
      transactions: [],
      subscriptions: [],
      goals: [],
      today: "2026-04-20",
      cushionMinor: 20_000,
    })

    expect(result.startingBalanceMinor).toBe(0)
    expect(result.averageDailyNetMinor).toBe(0)
    expect(result.budgetDailyMinor).toBe(0)
    expect(result.forecast).toHaveLength(90)
    expect(result.forecast.every((point) => point.balanceMinor === 0)).toBe(true)
    expect(result.breaches).toHaveLength(90)
    expect(result.scheduledCharges).toHaveLength(0)
    expect(result.assumptions.length).toBeGreaterThan(0)
  })

  it("projects residual flow when no recurring charges are detected", () => {
    const transactions = [
      income("pay", "2026-04-10", 90_000),
      expense("g1", "2026-04-12", "Corner Market", -30_000),
    ]
    const result = projectCashflow({
      transactions,
      subscriptions: [],
      goals: [],
      today: "2026-04-20",
      horizonDays: 10,
      lookbackDays: 30,
    })

    // Residual = (+90_000 - 30_000) / 30 = +2_000/day.
    expect(result.averageDailyNetMinor).toBeCloseTo(2_000, 5)
    expect(result.startingBalanceMinor).toBe(60_000)
    expect(result.scheduledCharges).toHaveLength(0)
    expect(result.forecast[0]?.balanceMinor).toBe(62_000)
    expect(result.forecast[9]?.balanceMinor).toBe(80_000)
  })

  it("treats an exact cushion touch as safe and only flags strictly below", () => {
    const transactions = [expense("flat", "2026-01-05", "One-Time Toll", -1_000)]
    const result = projectCashflow({
      transactions,
      subscriptions: [],
      goals: [],
      today: "2026-04-20",
      horizonDays: 5,
      lookbackDays: 30,
      cushionMinor: -1_000,
    })

    // No window activity: flat at the starting balance, exactly on the cushion.
    expect(result.forecast[0]?.balanceMinor).toBe(-1_000)
    expect(result.breaches).toHaveLength(0)

    const breached = projectCashflow({
      transactions,
      subscriptions: [],
      goals: [],
      today: "2026-04-20",
      horizonDays: 5,
      lookbackDays: 30,
      cushionMinor: -999,
    })
    expect(breached.breaches).toHaveLength(5)
  })

  it("schedules recurring charges across a month boundary on real calendar dates", () => {
    const transactions = [
      expense("s1", "2025-11-30", "Boundary Streaming", -3_000),
      expense("s2", "2025-12-30", "Boundary Streaming", -3_000),
      expense("s3", "2026-01-29", "Boundary Streaming", -3_000),
      expense("s4", "2026-02-28", "Boundary Streaming", -3_000),
    ]
    const { subscriptions } = detectSubscriptions(transactions)
    expect(subscriptions).toHaveLength(1)
    const subscription = subscriptions[0]
    if (!subscription) throw new Error("expected a subscription")

    const result = projectCashflow({
      transactions,
      subscriptions,
      goals: [],
      today: "2026-02-28",
      horizonDays: 62,
      lookbackDays: 30,
    })

    // Recurring spend is excluded from the residual average.
    expect(result.averageDailyNetMinor).toBe(0)
    const first = result.scheduledCharges[0]
    expect(first?.date).toBe(addDaysIso("2026-02-28", Math.round(subscription.medianIntervalDays)))
    for (const charge of result.scheduledCharges) {
      expect(charge.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${charge.date}T00:00:00Z`).toString()).not.toContain("Invalid")
    }
    // The March occurrence must exist and cross the February boundary.
    expect(result.scheduledCharges.some((charge) => charge.date.startsWith("2026-03"))).toBe(true)
    // Each scheduled charge drops the balance by the median amount.
    const drop = result.forecast.find((point) => point.date === first?.date)
    const previous =
      first?.date === result.forecast[0]?.date
        ? { balanceMinor: result.startingBalanceMinor }
        : (result.forecast.find((point) => point.date === addDaysIso(first?.date ?? "", -1)) ?? {
            balanceMinor: result.startingBalanceMinor,
          })
    expect((previous?.balanceMinor ?? 0) - (drop?.balanceMinor ?? 0)).toBe(
      subscription.medianAmountMinor,
    )
  })

  it("smooths irregular income across the window instead of spiking one day", () => {
    const transactions = [
      income("bonus", "2026-04-10", 300_000),
      expense("rent", "2026-04-11", "Monthly Rent", -100_000),
    ]
    const result = projectCashflow({
      transactions,
      subscriptions: [],
      goals: [],
      today: "2026-04-20",
      horizonDays: 30,
      lookbackDays: 30,
    })

    // Documented smoothing: (300_000 - 100_000) / 30 per day.
    expect(result.averageDailyNetMinor).toBeCloseTo(200_000 / 30, 5)
    // Rounding to whole cents spreads the fractional daily rate across days:
    // each step is within a cent of the ideal, and the 30-day total matches.
    const ideal = 200_000 / 30
    const dayGains = result.forecast.map((point, index) =>
      index === 0
        ? point.balanceMinor - result.startingBalanceMinor
        : point.balanceMinor - (result.forecast[index - 1]?.balanceMinor ?? 0),
    )
    for (const gain of dayGains) {
      expect(Math.abs(gain - ideal)).toBeLessThanOrEqual(1)
    }
    expect(result.forecast[29]?.balanceMinor).toBe(Math.round(200_000 + 200_000))
  })

  it("excludes budgeted-category spend from the residual and applies it as daily burn", () => {
    const transactions = [
      income("pay", "2026-04-10", 100_000),
      expense("d1", "2026-04-11", "Neighborhood Market", -30_000),
    ]
    const goals = [goal("Groceries", 30_437)]
    const withBudget = projectCashflow({
      transactions: transactions.map((transaction) =>
        transaction.id === "d1" ? { ...transaction, category: "Groceries" } : transaction,
      ),
      subscriptions: [],
      goals,
      today: "2026-04-20",
      horizonDays: 1,
      lookbackDays: 30,
    })

    // Only income remains in the residual; the grocery spend returns as budget burn.
    expect(withBudget.averageDailyNetMinor).toBeCloseTo(100_000 / 30, 5)
    expect(withBudget.budgetDailyMinor).toBeCloseTo(30_437 / 30.4375, 2)
    expect(withBudget.forecast[0]?.balanceMinor).toBe(
      Math.round(70_000 + 100_000 / 30 - 30_437 / 30.4375),
    )
  })

  it("advances stale recurring schedules to the first future date", () => {
    const transactions = [
      expense("o1", "2026-01-15", "Stale Streaming", -5_000),
      expense("o2", "2026-02-15", "Stale Streaming", -5_000),
      expense("o3", "2026-03-15", "Stale Streaming", -5_000),
    ]
    const { subscriptions } = detectSubscriptions(transactions)
    expect(subscriptions).toHaveLength(1)
    const result = projectCashflow({
      transactions,
      subscriptions,
      goals: [],
      today: "2026-04-20",
      horizonDays: 90,
    })
    expect(result.scheduledCharges.length).toBeGreaterThan(0)
    expect(result.scheduledCharges.every((charge) => charge.date > "2026-04-20")).toBe(true)
  })
})
