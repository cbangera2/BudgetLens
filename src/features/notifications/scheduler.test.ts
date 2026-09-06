// Scheduler tests run entirely against an injected fake adapter: no plugin,
// no bridge, no store. jsdom web no-ops are covered here too.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { BudgetGoal, Transaction } from "@/domain/models"
import { syncReminders, type ReminderSyncAdapter } from "@/features/notifications/scheduler"
import { reminderNumericId } from "@/lib/native"

let sequence = 0

function goal(amountMinor = 100_00): BudgetGoal {
  sequence += 1
  return {
    id: `goal-${sequence}`,
    category: "Groceries",
    amountMinor,
    period: "monthly",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  }
}

function expense(amountMinor = -8500, date = "2026-09-10"): Transaction {
  sequence += 1
  return {
    id: `tx-${sequence}`,
    date,
    description: "Acme Market",
    amountMinor,
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
  }
}

function fakeAdapter(overrides: Partial<ReminderSyncAdapter> = {}): ReminderSyncAdapter & {
  scheduled: { key: string }[]
  cancelled: (readonly number[] | undefined)[]
  persisted: string[][]
} {
  const scheduled: { key: string }[] = []
  const cancelled: (readonly number[] | undefined)[] = []
  const persisted: string[][] = []
  return {
    scheduled,
    cancelled,
    persisted,
    isNativeShell: true,
    enabled: true,
    firedKeys: [],
    checkPermission: async () => "granted",
    listPending: async () => [],
    schedule: async (reminders) => {
      scheduled.push(...reminders.map((reminder) => ({ key: reminder.key })))
    },
    cancel: async (ids) => {
      cancelled.push(ids)
    },
    persistFiredKeys: (fresh) => {
      persisted.push([...fresh])
    },
    ...overrides,
  }
}

const input = () => ({
  budgets: [goal()],
  transactions: [expense()],
  todayIso: "2026-09-15",
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("syncReminders web no-op", () => {
  it("schedules nothing on web and logs a debug", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
    const adapter = fakeAdapter({ isNativeShell: false })
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("skipped-web")
    expect(result.scheduled).toEqual([])
    expect(adapter.scheduled).toEqual([])
    expect(adapter.cancelled).toEqual([])
    expect(debug).toHaveBeenCalledOnce()
  })
})

describe("syncReminders toggle and permission paths", () => {
  it("never touches the plugin when the toggle is off", async () => {
    const adapter = fakeAdapter({ enabled: false })
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("skipped-disabled")
    expect(adapter.scheduled).toEqual([])
    expect(adapter.cancelled).toEqual([])
  })

  it("degrades silently when permission is denied", async () => {
    const adapter = fakeAdapter({ checkPermission: async () => "denied" })
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("skipped-denied")
    expect(adapter.scheduled).toEqual([])
    expect(adapter.cancelled).toEqual([])
  })

  it("degrades silently when the permission check throws", async () => {
    const adapter = fakeAdapter({
      checkPermission: async () => {
        throw new Error("bridge gone")
      },
    })
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("skipped-denied")
    expect(adapter.scheduled).toEqual([])
  })
})

describe("syncReminders reconciliation", () => {
  it("schedules due triggers and persists their keys", async () => {
    const adapter = fakeAdapter()
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("synced")
    expect(result.scheduled.map((reminder) => reminder.key)).toEqual([
      "budget:Groceries:2026-09:80",
    ])
    expect(adapter.persisted).toEqual([["budget:Groceries:2026-09:80"]])
  })

  it("skips already-pending triggers without rescheduling", async () => {
    const pendingId = reminderNumericId("budget:Groceries:2026-09:80")
    const adapter = fakeAdapter({
      listPending: async () => [{ id: pendingId, key: "budget:Groceries:2026-09:80" }],
    })
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("synced")
    expect(result.scheduled).toEqual([])
    expect(adapter.persisted).toEqual([])
  })

  it("never double-schedules a fired key from an earlier run", async () => {
    const adapter = fakeAdapter({ firedKeys: ["budget:Groceries:2026-09:80"] })
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("skipped-empty")
    expect(adapter.scheduled).toEqual([])
  })

  it("cancels stale triggers that no longer apply", async () => {
    const adapter = fakeAdapter({
      listPending: async () => [{ id: 4242, key: "budget:Groceries:2026-09:50" }],
    })
    // Spending now crosses 80%: the stale 50% key must go, the 80% key fires.
    const result = await syncReminders(input(), adapter)
    expect(result.cancelled).toEqual([4242])
    expect(result.scheduled.map((reminder) => reminder.key)).toEqual([
      "budget:Groceries:2026-09:80",
    ])
  })

  it("leaves foreign pending notifications alone", async () => {
    const adapter = fakeAdapter({
      listPending: async () => [{ id: 777, key: "something-else" }],
    })
    const result = await syncReminders(
      { budgets: [], transactions: [], todayIso: "2026-09-15" },
      adapter,
    )
    expect(result.status).toBe("skipped-empty")
    expect(adapter.cancelled).toEqual([])
  })

  it("is a no-op for empty data", async () => {
    const adapter = fakeAdapter()
    const result = await syncReminders(
      { budgets: [], transactions: [], todayIso: "2026-09-15" },
      adapter,
    )
    expect(result.status).toBe("skipped-empty")
    expect(adapter.scheduled).toEqual([])
    expect(adapter.cancelled).toEqual([])
  })

  it("reports skipped-error when scheduling fails", async () => {
    const adapter = fakeAdapter({
      schedule: async () => {
        throw new Error("disk full")
      },
    })
    const result = await syncReminders(input(), adapter)
    expect(result.status).toBe("skipped-error")
    expect(adapter.persisted).toEqual([])
  })
})
