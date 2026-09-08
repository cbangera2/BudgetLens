import { describe, expect, it } from "vitest"

import type { BudgetGoal } from "@/domain/models"
import type { SubscriptionSummary } from "@/features/subscriptions/detect"
import { buildTransaction } from "@/test/factories"

import { calculateSafeToSpend } from "./calculator"

function income(id: string, date: string, amountMinor: number) {
  return buildTransaction({
    id,
    date,
    description: "Synthetic Paycheck",
    amountMinor,
    category: "Income",
    transactionType: "Credit",
  })
}

function expense(id: string, date: string, amountMinor: number) {
  return buildTransaction({
    id,
    date,
    description: "Synthetic Market",
    amountMinor,
    category: "Groceries",
    transactionType: "Debit",
  })
}

function subscription(
  overrides: Partial<SubscriptionSummary> & { key: string },
): SubscriptionSummary {
  return {
    displayName: "Synthetic Streaming",
    occurrences: 3,
    medianIntervalDays: 7,
    medianAmountMinor: 1500,
    monthlyBurnMinor: 6000,
    lastDate: "2026-09-03",
    cadence: "biweekly",
    ...overrides,
  }
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

describe("calculateSafeToSpend", () => {
  it("subtracts bills due and pro-rated budget burn from month-to-date income", () => {
    const result = calculateSafeToSpend({
      transactions: [income("pay", "2026-09-01", 300_000)],
      subscriptions: [subscription({ key: "synthetic-streaming" })],
      goals: [goal("Groceries", 48_700)],
      today: "2026-09-10",
    })

    // Weekly bill from 2026-09-03 lands on 09-17 and 09-24: 2 x $15.00.
    expect(result.monthStart).toBe("2026-09-01")
    expect(result.monthEnd).toBe("2026-09-30")
    expect(result.remainingDays).toBe(20)
    expect(result.incomeMinor).toBe(300_000)
    expect(result.hasIncome).toBe(true)
    expect(result.bills.map((bill) => bill.date)).toEqual(["2026-09-17", "2026-09-24"])
    expect(result.billsDueMinor).toBe(3_000)
    // $487.00 monthly spreads to exactly $16.00/day; 20 days left = $320.00.
    expect(result.dailyBurnMinor).toBe(1_600)
    expect(result.usedTrailingAverage).toBe(false)
    expect(result.burnMinor).toBe(32_000)
    expect(result.safeMinor).toBe(265_000)
  })

  it("floors the result at zero instead of going negative", () => {
    const result = calculateSafeToSpend({
      transactions: [income("pay", "2026-09-01", 5_000)],
      subscriptions: [subscription({ key: "synthetic-streaming" })],
      goals: [goal("Groceries", 48_700)],
      today: "2026-09-10",
    })

    expect(result.safeMinor).toBe(0)
  })

  it("flags a month with no income yet instead of silently showing $0", () => {
    const result = calculateSafeToSpend({
      transactions: [expense("g1", "2026-09-02", -4_000)],
      subscriptions: [],
      goals: [goal("Groceries", 48_700)],
      today: "2026-09-10",
    })

    expect(result.incomeMinor).toBe(0)
    expect(result.hasIncome).toBe(false)
    expect(result.safeMinor).toBe(0)
  })

  it("falls back to trailing-average daily spend when no budgets are set", () => {
    const result = calculateSafeToSpend({
      transactions: [
        income("pay", "2026-09-01", 100_000),
        expense("g1", "2026-09-05", -30_000),
        expense("g2", "2026-08-20", -30_000),
        // Outside the 30-day window ending 2026-09-10: ignored.
        expense("old", "2026-08-01", -90_000),
      ],
      subscriptions: [],
      goals: [],
      today: "2026-09-10",
    })

    // ($300 + $300) / 30 days = $20.00/day; 20 days left = $400.00.
    expect(result.usedTrailingAverage).toBe(true)
    expect(result.trailingDailySpendMinor).toBe(2_000)
    expect(result.burnMinor).toBe(40_000)
    expect(result.safeMinor).toBe(60_000)
  })

  it("counts nothing past today on the last day of the month", () => {
    const result = calculateSafeToSpend({
      transactions: [income("pay", "2026-09-01", 50_000)],
      subscriptions: [subscription({ key: "synthetic-streaming" })],
      goals: [goal("Groceries", 48_700)],
      today: "2026-09-30",
    })

    expect(result.remainingDays).toBe(0)
    expect(result.burnMinor).toBe(0)
    expect(result.bills).toEqual([])
    expect(result.billsDueMinor).toBe(0)
    expect(result.safeMinor).toBe(50_000)
  })

  it("counts only income received through today, never projected paydays", () => {
    const result = calculateSafeToSpend({
      transactions: [
        income("early", "2026-09-01", 100_000),
        // Mid-month payday arrives after today: excluded until received.
        income("mid", "2026-09-25", 100_000),
        // Last month's paycheck belongs to last month.
        income("prior", "2026-08-28", 100_000),
      ],
      subscriptions: [],
      goals: [],
      today: "2026-09-10",
    })

    expect(result.incomeMinor).toBe(100_000)
  })

  it("includes a payday that lands exactly on today", () => {
    const result = calculateSafeToSpend({
      transactions: [income("pay", "2026-09-10", 100_000)],
      subscriptions: [],
      goals: [],
      today: "2026-09-10",
    })

    expect(result.incomeMinor).toBe(100_000)
    expect(result.hasIncome).toBe(true)
  })

  it("jumps stale schedules forward to occurrences after today", () => {
    const result = calculateSafeToSpend({
      transactions: [income("pay", "2026-09-01", 100_000)],
      subscriptions: [
        subscription({
          key: "synthetic-stale",
          medianIntervalDays: 30,
          medianAmountMinor: 2_000,
          lastDate: "2026-06-01",
        }),
      ],
      goals: [],
      today: "2026-09-10",
    })

    // 2026-06-01 + 4 x 30 days = 2026-09-29, the only occurrence left in September.
    expect(result.bills.map((bill) => bill.date)).toEqual(["2026-09-29"])
    expect(result.billsDueMinor).toBe(2_000)
  })

  it("spreads yearly budgets per day alongside monthly budgets", () => {
    const result = calculateSafeToSpend({
      transactions: [income("pay", "2026-09-01", 100_000)],
      subscriptions: [],
      goals: [goal("Insurance", 36_525, "yearly")],
      today: "2026-09-10",
    })

    // $365.25 yearly spreads to exactly $1.00/day; 20 days left = $20.00.
    expect(result.dailyBurnMinor).toBe(100)
    expect(result.burnMinor).toBe(2_000)
    expect(result.safeMinor).toBe(98_000)
  })

  it("rejects an invalid today", () => {
    expect(() =>
      calculateSafeToSpend({
        transactions: [],
        subscriptions: [],
        goals: [],
        today: "2026-02-30",
      }),
    ).toThrow("Invalid today ISO date")
  })
})
