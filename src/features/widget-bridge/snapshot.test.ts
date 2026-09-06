import type {
  FinanceSnapshot,
  SnapshotBudget,
  SnapshotNetWorthPoint,
  SnapshotSpendingBucket,
} from "@/features/assistant/data-tools"
import { formatMinor } from "@/features/assistant/provider"
import {
  MAX_WIDGET_BUDGETS,
  MAX_WIDGET_CATEGORIES,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
  WIDGET_SNAPSHOT_SIZE_BUDGET_BYTES,
  buildWidgetSnapshot,
  serializeWidgetSnapshot,
  validateWidgetSnapshot,
} from "@/features/widget-bridge/snapshot"

const NOW = new Date("2026-09-06T12:00:00.000Z")

function bucket(category: string, totalMinor: number, count = 1): SnapshotSpendingBucket {
  return { category, count, totalMinor, total: `$${(totalMinor / 100).toFixed(2)}` }
}

function goal(
  category: string,
  spentMinor: number,
  goalMinor: number,
  period = "monthly",
): SnapshotBudget {
  return {
    category,
    period,
    goalMinor,
    goal: `$${(goalMinor / 100).toFixed(2)}`,
    spentMinor,
    spent: `$${(spentMinor / 100).toFixed(2)}`,
    remainingMinor: goalMinor - spentMinor,
    remaining: `$${((goalMinor - spentMinor) / 100).toFixed(2)}`,
    over: spentMinor > goalMinor,
  }
}

function point(date: string, valueMinor: number, series = "netWorth"): SnapshotNetWorthPoint {
  return { date, series, valueMinor, value: `$${(valueMinor / 100).toFixed(2)}` }
}

function finance(overrides: Partial<FinanceSnapshot> = {}): FinanceSnapshot {
  return {
    generatedAt: "2026-09-06T11:00:00.000Z",
    transactionCount: 42,
    spending: [bucket("Groceries", -42500, 12), bucket("Dining", -18000, 6)],
    previousSpending: [bucket("Groceries", -40000, 11)],
    budgets: [goal("Groceries", 42500, 50000), goal("Dining", 18000, 15000)],
    netWorth: [point("2026-07-31", 1000000), point("2026-08-31", 1050000)],
    extremes: { largestExpense: null, largestIncome: null },
    topTransactions: [],
    dailySeries: [],
    recentTransactions: [],
    ...overrides,
  }
}

describe("buildWidgetSnapshot", () => {
  it("stamps the schema version, month, and transaction count", () => {
    const snapshot = buildWidgetSnapshot(finance(), { now: NOW })

    expect(snapshot.version).toBe(WIDGET_SNAPSHOT_SCHEMA_VERSION)
    expect(snapshot.generatedAt).toBe("2026-09-06T12:00:00.000Z")
    expect(snapshot.transactionCount).toBe(42)
    expect(snapshot.month.month).toBe("2026-09")
  })

  it("reports the latest net worth plus the delta vs the previous point", () => {
    const snapshot = buildWidgetSnapshot(finance(), { now: NOW })

    expect(snapshot.netWorth).toMatchObject({
      date: "2026-08-31",
      latestMinor: 1050000,
      deltaMinor: 50000,
    })
    expect(snapshot.netWorth.latest).toBe("$10500.00") // reuses the tool display string verbatim
    expect(snapshot.netWorth.delta).toBe(formatMinor(50000)) // derived here, so formatted here
  })

  it("leaves the delta null with a single point and nulls everything when empty", () => {
    const single = buildWidgetSnapshot(finance({ netWorth: [point("2026-08-31", 1050000)] }), {
      now: NOW,
    })
    expect(single.netWorth.latestMinor).toBe(1050000)
    expect(single.netWorth.deltaMinor).toBeNull()
    expect(single.netWorth.delta).toBeNull()

    const empty = buildWidgetSnapshot(finance({ netWorth: [] }), { now: NOW })
    expect(empty.netWorth).toEqual({
      date: null,
      latestMinor: null,
      latest: null,
      deltaMinor: null,
      delta: null,
    })
  })

  it("sums month spend vs budget across goals and flags over-budget", () => {
    const snapshot = buildWidgetSnapshot(finance(), { now: NOW })

    // 42500 + 18000 spent vs 50000 + 15000 budgeted.
    expect(snapshot.month.spentMinor).toBe(60500)
    expect(snapshot.month.budgetMinor).toBe(65000)
    expect(snapshot.month.remainingMinor).toBe(4500)
    expect(snapshot.month.over).toBe(false)

    const over = buildWidgetSnapshot(finance({ budgets: [goal("Dining", 18000, 15000)] }), {
      now: NOW,
    })
    expect(over.month.over).toBe(true)
    expect(over.month.remainingMinor).toBe(-3000)
  })

  it("zeroes the month summary when there are no budgets", () => {
    const snapshot = buildWidgetSnapshot(finance({ budgets: [] }), { now: NOW })

    expect(snapshot.month.spentMinor).toBe(0)
    expect(snapshot.month.budgetMinor).toBe(0)
    expect(snapshot.month.over).toBe(false)
    expect(snapshot.budgets).toEqual([])
  })

  it(`caps top categories at ${MAX_WIDGET_CATEGORIES} preserving rank order`, () => {
    const spending = ["A", "B", "C", "D", "E", "F", "G"].map((category, index) =>
      bucket(category, -(700 - index * 100)),
    )
    const snapshot = buildWidgetSnapshot(finance({ spending }), { now: NOW })

    expect(snapshot.topCategories).toHaveLength(MAX_WIDGET_CATEGORIES)
    expect(snapshot.topCategories.map((entry) => entry.category)).toEqual(["A", "B", "C", "D", "E"])
  })

  it(`caps budgets at ${MAX_WIDGET_BUDGETS} sorted by spend descending`, () => {
    const budgets = Array.from({ length: 12 }, (_, index) =>
      goal(`Category ${index}`, (index + 1) * 1000, 50000),
    )
    const snapshot = buildWidgetSnapshot(finance({ budgets }), { now: NOW })

    expect(snapshot.budgets).toHaveLength(MAX_WIDGET_BUDGETS)
    expect(snapshot.budgets[0]?.category).toBe("Category 11")
    // Month totals still cover ALL goals, not just the capped slice.
    expect(snapshot.month.spentMinor).toBe(78000)
    expect(snapshot.month.budgetMinor).toBe(600000)
  })

  it("stays well under the widget size budget", () => {
    const budgets = Array.from({ length: 30 }, (_, index) =>
      goal(`Category ${index}`, (index + 1) * 1000, 50000),
    )
    const json = serializeWidgetSnapshot(buildWidgetSnapshot(finance({ budgets }), { now: NOW }))

    expect(json.length).toBeLessThan(WIDGET_SNAPSHOT_SIZE_BUDGET_BYTES)
  })
})

describe("validateWidgetSnapshot", () => {
  it("accepts builder output round-tripped through JSON", () => {
    const parsed: unknown = JSON.parse(
      serializeWidgetSnapshot(buildWidgetSnapshot(finance(), { now: NOW })),
    )

    const result = validateWidgetSnapshot(parsed)

    expect(result).toEqual({
      ok: true,
      snapshot: expect.objectContaining({ version: WIDGET_SNAPSHOT_SCHEMA_VERSION }),
    })
  })

  it("rejects future schema versions with a versioned reason", () => {
    const parsed: unknown = JSON.parse(
      serializeWidgetSnapshot(buildWidgetSnapshot(finance(), { now: NOW })),
    )
    if (typeof parsed !== "object" || parsed === null) throw new Error("expected an object")

    const result = validateWidgetSnapshot({ ...parsed, version: 999 })

    expect(result).toEqual({ ok: false, reason: "unsupported-version:999" })
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "nope"],
    ["number", 42],
    ["array", []],
    ["empty object", {}],
    ["version only", { version: 1 }],
  ])("rejects malformed payload %s without throwing", (_label, payload) => {
    expect(validateWidgetSnapshot(payload).ok).toBe(false)
  })

  it("names the first missing field", () => {
    expect(validateWidgetSnapshot({ version: 1 })).toEqual({
      ok: false,
      reason: "missing-generatedAt",
    })
  })
})
