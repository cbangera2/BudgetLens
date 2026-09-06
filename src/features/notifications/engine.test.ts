// Synthetic fixtures only: no real merchants, no real amounts.
import { describe, expect, it } from "vitest"

import type { BudgetGoal, Transaction } from "@/domain/models"
import { computePendingReminders, crossedThreshold } from "@/features/notifications/engine"

let sequence = 0

function goal(overrides: Partial<BudgetGoal> = {}): BudgetGoal {
  sequence += 1
  return {
    id: `goal-${sequence}`,
    category: "Groceries",
    amountMinor: 100_00,
    period: "monthly",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

function expense(overrides: Partial<Transaction> = {}): Transaction {
  sequence += 1
  return {
    id: `tx-${sequence}`,
    date: "2026-09-10",
    description: "Acme Market",
    amountMinor: -1000,
    category: "Groceries",
    transactionType: "expense",
    accountName: null,
    accountType: null,
    provider: null,
    labels: [],
    notes: null,
    groupId: null,
    shared: false,
    shareCount: 2,
    importBatchId: "manual",
    fingerprint: `fp-${sequence}`,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  }
}

describe("crossedThreshold", () => {
  it("fires exactly on the boundary", () => {
    expect(crossedThreshold(5000, 10000)).toBe(50)
    expect(crossedThreshold(8000, 10000)).toBe(80)
    expect(crossedThreshold(10000, 10000)).toBe(100)
  })

  it("stays silent one minor unit below the boundary", () => {
    expect(crossedThreshold(4999, 10000)).toBeNull()
  })

  it("reports only the highest crossed threshold", () => {
    expect(crossedThreshold(9000, 10000)).toBe(80)
    expect(crossedThreshold(25000, 10000)).toBe(100)
  })

  it("rejects degenerate goals", () => {
    expect(crossedThreshold(5000, 0)).toBeNull()
    expect(crossedThreshold(5000, -100)).toBeNull()
    expect(crossedThreshold(-5, 10000)).toBeNull()
  })
})

describe("computePendingReminders budgets", () => {
  it("is a no-op for empty data", () => {
    expect(
      computePendingReminders({ budgets: [], transactions: [], todayIso: "2026-09-15" }),
    ).toEqual([])
  })

  it("ignores invalid reference days", () => {
    expect(
      computePendingReminders({
        budgets: [goal()],
        transactions: [expense()],
        todayIso: "not-a-date",
      }),
    ).toEqual([])
  })

  it("fires one reminder for the highest crossed threshold", () => {
    const reminders = computePendingReminders({
      budgets: [goal({ amountMinor: 100_00 })],
      transactions: [expense({ amountMinor: -8500 })],
      todayIso: "2026-09-15",
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ kind: "budget", key: "budget:Groceries:2026-09:80" })
    expect(reminders[0]?.title).toContain("80%")
  })

  it("fires the 100% reminder on the exact boundary", () => {
    const reminders = computePendingReminders({
      budgets: [goal({ amountMinor: 100_00 })],
      transactions: [expense({ amountMinor: -100_00 })],
      todayIso: "2026-09-15",
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0]?.key).toBe("budget:Groceries:2026-09:100")
  })

  it("ignores other months, other categories, and income", () => {
    const reminders = computePendingReminders({
      budgets: [goal({ amountMinor: 100_00 })],
      transactions: [
        expense({ date: "2026-08-10", amountMinor: -9000 }),
        expense({ category: "Dining", amountMinor: -9000 }),
        expense({ amountMinor: 9000, transactionType: "income", category: "Groceries" }),
      ],
      todayIso: "2026-09-15",
    })
    expect(reminders).toEqual([])
  })

  it("skips yearly goals (monthly budgets only)", () => {
    const reminders = computePendingReminders({
      budgets: [goal({ period: "yearly", amountMinor: 100_00 })],
      transactions: [expense({ amountMinor: -100_00 })],
      todayIso: "2026-09-15",
    })
    expect(reminders).toEqual([])
  })

  it("never double-schedules the same period key", () => {
    const input = {
      budgets: [goal({ amountMinor: 100_00 })],
      transactions: [expense({ amountMinor: -8500 })],
      todayIso: "2026-09-15",
    }
    const first = computePendingReminders(input)
    expect(first).toHaveLength(1)
    const second = computePendingReminders({
      ...input,
      firedKeys: new Set([first[0]?.key ?? ""]),
    })
    expect(second).toEqual([])
  })

  it("fires the next threshold when spending climbs further", () => {
    const heavier = {
      budgets: [goal({ amountMinor: 100_00 })],
      transactions: [expense({ amountMinor: -100_00 })],
      todayIso: "2026-09-15",
      firedKeys: new Set(["budget:Groceries:2026-09:80"]),
    }
    const reminders = computePendingReminders(heavier)
    expect(reminders.map((reminder) => reminder.key)).toEqual(["budget:Groceries:2026-09:100"])
  })
})

describe("computePendingReminders bills", () => {
  function monthlyCharges(dates: string[], description = "Northwind Streaming"): Transaction[] {
    return dates.map((date, index) =>
      expense({
        id: `bill-${index}`,
        date,
        description,
        amountMinor: -1299,
        category: "Entertainment",
        fingerprint: `bill-fp-${index}`,
      }),
    )
  }

  it("reminds when the predicted charge is within 3 days", () => {
    const reminders = computePendingReminders({
      budgets: [],
      transactions: monthlyCharges(["2026-06-15", "2026-07-15", "2026-08-14"]),
      todayIso: "2026-09-12",
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ kind: "bill" })
    expect(reminders[0]?.key).toBe("bill:northwind streaming:2026-09-13")
    expect(reminders[0]?.title).toContain("tomorrow")
  })

  it("stays silent outside the upcoming window", () => {
    const transactions = monthlyCharges(["2026-06-14", "2026-07-14", "2026-08-14"])
    expect(computePendingReminders({ budgets: [], transactions, todayIso: "2026-09-01" })).toEqual(
      [],
    )
    // Predicted 2026-09-13 is already past: overdue charges do not re-fire.
    expect(computePendingReminders({ budgets: [], transactions, todayIso: "2026-09-20" })).toEqual(
      [],
    )
  })

  it("requires three occurrences", () => {
    const reminders = computePendingReminders({
      budgets: [],
      transactions: monthlyCharges(["2026-07-14", "2026-08-14"]),
      todayIso: "2026-09-12",
    })
    expect(reminders).toEqual([])
  })

  it("rejects irregular merchants", () => {
    const reminders = computePendingReminders({
      budgets: [],
      transactions: monthlyCharges(["2026-06-01", "2026-06-20", "2026-08-14"]),
      todayIso: "2026-09-12",
    })
    expect(reminders).toEqual([])
  })

  it("ignores income with the same description", () => {
    const reminders = computePendingReminders({
      budgets: [],
      transactions: [
        ...monthlyCharges(["2026-06-14", "2026-07-14"]),
        expense({
          date: "2026-08-14",
          description: "Northwind Streaming",
          amountMinor: 1299,
          transactionType: "income",
        }),
      ],
      todayIso: "2026-09-12",
    })
    expect(reminders).toEqual([])
  })
})
