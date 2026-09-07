import { buildTransaction } from "@/test/factories"

import {
  bucketTotals,
  collectExpenseWeights,
  detectMonthlyIncomeAverage,
  EVERYTHING_ELSE_CATEGORY,
  partitionByExisting,
  planTemplateGoals,
  splitMinorUnits,
  type PlannedGoal,
} from "./allocation"
import { BUDGET_TEMPLATE_PRESETS, validateCustomRatios } from "./presets"

function expense(id: string, date: string, amountMinor: number, category: string | null) {
  return buildTransaction({ id, date, amountMinor, category, transactionType: "Debit" })
}

function income(id: string, date: string, amountMinor: number) {
  return buildTransaction({ id, date, amountMinor, category: "Income", transactionType: "Credit" })
}

describe("splitMinorUnits", () => {
  it("splits exactly when ratios divide evenly", () => {
    expect(splitMinorUnits(300_000, [50, 30, 20])).toEqual([150_000, 90_000, 60_000])
  })

  it("conserves rounding dust in minor units", () => {
    // 100.01 split 50/30/20 leaves a 1-cent remainder for the largest fraction.
    const parts = splitMinorUnits(10_001, [50, 30, 20])
    expect(parts).toEqual([5_001, 3_000, 2_000])
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(10_001)
  })

  it("distributes dust deterministically across many parts", () => {
    const parts = splitMinorUnits(10, [1, 1, 1])
    expect(parts).toEqual([4, 3, 3])
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(10)
  })

  it("falls back to an equal split for zero weights", () => {
    expect(splitMinorUnits(100, [0, 0])).toEqual([50, 50])
  })

  it("rejects negative totals", () => {
    expect(() => splitMinorUnits(-5, [50, 50])).toThrow(RangeError)
  })
})

describe("bucketTotals", () => {
  it("computes the 50/30/20 split of a monthly income", () => {
    expect(bucketTotals(300_000, 50, 30, 20)).toEqual([150_000, 90_000, 60_000])
  })

  it("rejects ratios that do not sum to 100", () => {
    expect(() => bucketTotals(300_000, 50, 30, 10)).toThrow(RangeError)
  })
})

describe("collectExpenseWeights", () => {
  it("ignores income and groups spend by category, sorted", () => {
    const weights = collectExpenseWeights([
      income("pay", "2026-09-10", 300_000),
      expense("g1", "2026-09-05", -12_000, "Groceries"),
      expense("d1", "2026-09-08", -8_000, "Dining"),
      expense("g2", "2026-08-05", -10_000, "Groceries"),
    ])
    expect(weights).toEqual([
      { category: "Dining", spendMinor: 8_000 },
      { category: "Groceries", spendMinor: 22_000 },
    ])
  })

  it("routes uncategorized spend to the named Everything-else bucket", () => {
    const weights = collectExpenseWeights([
      expense("u1", "2026-09-05", -4_000, null),
      expense("u2", "2026-09-06", -1_000, "   "),
    ])
    expect(weights).toEqual([{ category: EVERYTHING_ELSE_CATEGORY, spendMinor: 5_000 }])
  })
})

describe("planTemplateGoals", () => {
  const weights = [
    { category: "Dining", spendMinor: 8_000 },
    { category: "Groceries", spendMinor: 22_000 },
  ]

  it("maps the spending pool onto existing categories proportionally", () => {
    const goals = planTemplateGoals({
      incomeMinor: 300_000,
      needsPct: 50,
      wantsPct: 30,
      savingsPct: 20,
      period: "monthly",
      weights,
    })
    // Spending pool 240,000 split 8000:22000 -> 64,000 / 176,000.
    expect(goals).toEqual([
      { category: "Dining", amountMinor: 64_000, period: "monthly", bucket: "spending" },
      { category: "Groceries", amountMinor: 176_000, period: "monthly", bucket: "spending" },
      { category: "Savings", amountMinor: 60_000, period: "monthly", bucket: "savings" },
    ])
  })

  it("conserves the full income total including dust", () => {
    const goals = planTemplateGoals({
      incomeMinor: 10_001,
      needsPct: 50,
      wantsPct: 30,
      savingsPct: 20,
      period: "monthly",
      weights,
    })
    expect(goals.reduce((sum, goal) => sum + goal.amountMinor, 0)).toBe(10_001)
  })

  it("falls back to Needs/Wants/Savings buckets without expense history", () => {
    expect(
      planTemplateGoals({
        incomeMinor: 300_000,
        needsPct: 50,
        wantsPct: 30,
        savingsPct: 20,
        period: "monthly",
        weights: [],
      }),
    ).toEqual([
      { category: "Needs", amountMinor: 150_000, period: "monthly", bucket: "needs" },
      { category: "Savings", amountMinor: 60_000, period: "monthly", bucket: "savings" },
      { category: "Wants", amountMinor: 90_000, period: "monthly", bucket: "wants" },
    ])
  })

  it("annualizes goals twelvefold for the yearly period", () => {
    const goals = planTemplateGoals({
      incomeMinor: 300_000,
      needsPct: 50,
      wantsPct: 30,
      savingsPct: 20,
      period: "yearly",
      weights,
    })
    expect(goals.reduce((sum, goal) => sum + goal.amountMinor, 0)).toBe(300_000 * 12)
    expect(goals.find((goal) => goal.category === "Savings")).toMatchObject({
      amountMinor: 720_000,
      period: "yearly",
    })
  })

  it("omits zero-share buckets and keeps the remainder conserved", () => {
    const goals = planTemplateGoals({
      incomeMinor: 100_000,
      needsPct: 50,
      wantsPct: 50,
      savingsPct: 0,
      period: "monthly",
      weights,
    })
    expect(goals.some((goal) => goal.category === "Savings")).toBe(false)
    expect(goals.reduce((sum, goal) => sum + goal.amountMinor, 0)).toBe(100_000)
  })

  it("never plans two goals for one category when spend includes Savings", () => {
    const goals = planTemplateGoals({
      incomeMinor: 100_000,
      needsPct: 50,
      wantsPct: 30,
      savingsPct: 20,
      period: "monthly",
      weights: [...weights, { category: "Savings", spendMinor: 50_000 }],
    })
    expect(goals.filter((goal) => goal.category === "Savings")).toHaveLength(1)
    expect(goals.reduce((sum, goal) => sum + goal.amountMinor, 0)).toBe(100_000)
  })

  it("rejects non-positive income", () => {
    expect(() =>
      planTemplateGoals({
        incomeMinor: 0,
        needsPct: 50,
        wantsPct: 30,
        savingsPct: 20,
        period: "monthly",
        weights,
      }),
    ).toThrow(RangeError)
  })
})

describe("partitionByExisting", () => {
  const planned: PlannedGoal[] = [
    { category: "Dining", amountMinor: 64_000, period: "monthly", bucket: "spending" },
    { category: "Groceries", amountMinor: 176_000, period: "monthly", bucket: "spending" },
    { category: "Savings", amountMinor: 60_000, period: "monthly", bucket: "savings" },
  ]

  it("skips categories that already have goals for the period", () => {
    const partition = partitionByExisting(
      planned,
      [{ category: "Groceries", period: "monthly" }],
      "monthly",
    )
    expect(partition.create.map((goal) => goal.category)).toEqual(["Dining", "Savings"])
    expect(partition.skipped.map((goal) => goal.category)).toEqual(["Groceries"])
  })

  it("matches case-insensitively but only within the same period", () => {
    const partition = partitionByExisting(
      planned,
      [
        { category: "  dining ", period: "monthly" },
        { category: "Savings", period: "yearly" },
      ],
      "monthly",
    )
    expect(partition.create.map((goal) => goal.category)).toEqual(["Groceries", "Savings"])
    expect(partition.skipped.map((goal) => goal.category)).toEqual(["Dining"])
  })

  it("is idempotent: reapplying after creation skips everything", () => {
    const createdOnce = partitionByExisting(planned, [], "monthly").create
    const existingAfterApply = createdOnce.map((goal) => ({
      category: goal.category,
      period: goal.period,
    }))
    const reapply = partitionByExisting(planned, existingAfterApply, "monthly")
    expect(reapply.create).toEqual([])
    expect(reapply.skipped).toHaveLength(planned.length)
  })
})

describe("custom ratio validation", () => {
  it("accepts ratios that sum to 100", () => {
    expect(validateCustomRatios("50", "30", "20")).toEqual({ ok: true, ratios: [50, 30, 20] })
  })

  it("rejects ratios that do not sum to 100 and reports the current total", () => {
    expect(validateCustomRatios("50", "30", "10")).toEqual({
      ok: false,
      error: expect.stringContaining("100 (currently 90)"),
    })
  })

  it("rejects blank, non-numeric, negative, and fractional inputs", () => {
    expect(validateCustomRatios("", "50", "50").ok).toBe(false)
    expect(validateCustomRatios("abc", "50", "50").ok).toBe(false)
    expect(validateCustomRatios("-10", "60", "50").ok).toBe(false)
    expect(validateCustomRatios("33.3", "33.3", "33.4").ok).toBe(false)
    expect(validateCustomRatios("101", "0", "-1").ok).toBe(false)
  })

  it("ships presets that each sum to 100", () => {
    expect(BUDGET_TEMPLATE_PRESETS.length).toBeGreaterThanOrEqual(3)
    for (const preset of BUDGET_TEMPLATE_PRESETS) {
      expect(preset.needsPct + preset.wantsPct + preset.savingsPct).toBe(100)
    }
  })
})

describe("detectMonthlyIncomeAverage", () => {
  it("averages income across the months that have income", () => {
    const detected = detectMonthlyIncomeAverage([
      income("p1", "2026-07-10", 300_000),
      income("p2", "2026-08-10", 300_000),
      income("p3", "2026-09-10", 300_000),
      expense("g1", "2026-09-05", -12_000, "Groceries"),
    ])
    expect(detected).toEqual({ averageMinor: 300_000, monthCount: 3, totalMinor: 900_000 })
  })

  it("rounds the average and aggregates multiple paydays per month", () => {
    const detected = detectMonthlyIncomeAverage([
      income("p1", "2026-08-10", 150_000),
      income("p2", "2026-08-24", 150_001),
      income("p3", "2026-09-10", 300_000),
    ])
    // (300001 + 300000) / 2 = 300000.5 -> rounds half up to 300001.
    expect(detected).toEqual({ averageMinor: 300_001, monthCount: 2, totalMinor: 600_001 })
  })

  it("returns null without income history", () => {
    expect(
      detectMonthlyIncomeAverage([expense("g1", "2026-09-05", -12_000, "Groceries")]),
    ).toBeNull()
    expect(detectMonthlyIncomeAverage([])).toBeNull()
  })
})
