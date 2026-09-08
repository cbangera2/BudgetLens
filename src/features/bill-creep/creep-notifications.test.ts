// Creep notifier tests run against an injected fake adapter: no plugin, no
// bridge, no store. Synthetic fixtures only.
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Transaction } from "@/domain/models"
import { reminderNumericId } from "@/lib/native"
import { buildTransaction } from "@/test/factories"

import { type BillCreep } from "./creep"
import {
  computeCreepReminders,
  creepReminderKey,
  resetCreepStoreSyncForTests,
  syncCreepReminders,
  toCreepReminder,
  type CreepSyncAdapter,
} from "./creep-notifications"

function monthly(idPrefix: string, description: string, amounts: number[]) {
  return amounts.map((amountMinor, index) =>
    buildTransaction({
      id: `${idPrefix}-${index}`,
      date: `2026-0${index + 1}-15`,
      description,
      amountMinor,
      transactionType: "Debit",
    }),
  )
}

const creepTransactions: Transaction[] = monthly(
  "up",
  "Acme Streaming",
  [-1000, -1000, -1000, -1200],
)

function fakeAdapter(overrides: Partial<CreepSyncAdapter> = {}): CreepSyncAdapter & {
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

const creep: BillCreep = {
  key: "acme streaming",
  displayName: "Acme Streaming",
  baselineMinor: 1000,
  latestMinor: 1200,
  deltaMinor: 200,
  deltaPct: 20,
  firstSeenDate: "2026-01-15",
  latestDate: "2026-04-15",
  occurrences: 4,
}

afterEach(() => {
  resetCreepStoreSyncForTests()
  vi.restoreAllMocks()
})

describe("toCreepReminder", () => {
  it("builds a stable key with the old-to-new figures", () => {
    expect(creepReminderKey(creep)).toBe("creep:acme streaming:2026-04-15")
    const reminder = toCreepReminder(creep)
    expect(reminder.key).toBe("creep:acme streaming:2026-04-15")
    expect(reminder.kind).toBe("bill")
    expect(reminder.title).toContain("Acme Streaming")
    expect(reminder.body).toContain("$10.00")
    expect(reminder.body).toContain("$12.00")
    expect(reminder.body).toContain("20%")
  })
})

describe("computeCreepReminders", () => {
  it("derives one reminder per creep", () => {
    const reminders = computeCreepReminders(creepTransactions)
    expect(reminders.map((reminder) => reminder.key)).toEqual(["creep:acme streaming:2026-04-15"])
  })

  it("is empty without creeps and skips dismissed merchants", () => {
    expect(computeCreepReminders([])).toEqual([])
    expect(computeCreepReminders(creepTransactions, new Set(["acme streaming"]))).toEqual([])
  })
})

describe("syncCreepReminders", () => {
  it("schedules nothing on web and logs a debug", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)
    const adapter = fakeAdapter({ isNativeShell: false })
    const result = await syncCreepReminders(creepTransactions, adapter)
    expect(result.status).toBe("skipped-web")
    expect(adapter.scheduled).toEqual([])
    expect(debug).toHaveBeenCalledOnce()
  })

  it("never touches the plugin when the toggle is off", async () => {
    const adapter = fakeAdapter({ enabled: false })
    const result = await syncCreepReminders(creepTransactions, adapter)
    expect(result.status).toBe("skipped-disabled")
    expect(adapter.scheduled).toEqual([])
  })

  it("degrades silently when permission is denied", async () => {
    const adapter = fakeAdapter({ checkPermission: async () => "denied" })
    const result = await syncCreepReminders(creepTransactions, adapter)
    expect(result.status).toBe("skipped-denied")
    expect(adapter.scheduled).toEqual([])
  })

  it("schedules creep triggers and persists their keys", async () => {
    const adapter = fakeAdapter()
    const result = await syncCreepReminders(creepTransactions, adapter)
    expect(result.status).toBe("synced")
    expect(result.scheduled.map((reminder) => reminder.key)).toEqual([
      "creep:acme streaming:2026-04-15",
    ])
    expect(adapter.persisted).toEqual([["creep:acme streaming:2026-04-15"]])
  })

  it("skips already-pending and already-fired triggers", async () => {
    const key = "creep:acme streaming:2026-04-15"
    const pendingId = reminderNumericId(key)
    const pending = fakeAdapter({ listPending: async () => [{ id: pendingId, key }] })
    expect((await syncCreepReminders(creepTransactions, pending)).scheduled).toEqual([])
    const fired = fakeAdapter({ firedKeys: [key] })
    const result = await syncCreepReminders(creepTransactions, fired)
    expect(result.scheduled).toEqual([])
    expect(fired.persisted).toEqual([])
  })

  it("cancels stale creep keys but leaves foreign notifications alone", async () => {
    const adapter = fakeAdapter({
      listPending: async () => [
        { id: 4242, key: "creep:acme streaming:2026-03-15" },
        { id: 777, key: "something-else" },
      ],
    })
    const result = await syncCreepReminders(creepTransactions, adapter)
    expect(result.cancelled).toEqual([4242])
    expect(result.scheduled.map((reminder) => reminder.key)).toEqual([
      "creep:acme streaming:2026-04-15",
    ])
  })

  it("is a no-op for empty data", async () => {
    const adapter = fakeAdapter()
    const result = await syncCreepReminders([], adapter)
    expect(result.status).toBe("skipped-empty")
    expect(adapter.scheduled).toEqual([])
  })
})
