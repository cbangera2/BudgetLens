// Enable/disable path tests with the bridge and store fully mocked.
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setRemindersEnabled } from "@/features/notifications/scheduler"

const mocks = vi.hoisted(() => ({
  isNative: vi.fn<() => boolean>(() => false),
  requestPermission: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  checkPermission: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  schedule: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cancel: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listPending: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  budgetsList: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  transactionsList: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock("@/lib/native", () => ({
  isNative: mocks.isNative,
  checkReminderPermission: mocks.checkPermission,
  requestReminderPermission: mocks.requestPermission,
  scheduleReminderNotifications: mocks.schedule,
  cancelReminderNotifications: mocks.cancel,
  listPendingReminderKeys: mocks.listPending,
  reminderNumericId: (key: string) => {
    let hash = 5381
    for (let index = 0; index < key.length; index += 1) {
      hash = ((hash * 33) ^ (key.charCodeAt(index) & 0xff)) | 0
    }
    return (Math.abs(hash) % 2_147_483_646) + 1
  },
}))

vi.mock("@/db/repositories", () => ({
  repositories: {
    budgets: { list: mocks.budgetsList },
    transactions: { list: mocks.transactionsList },
  },
}))

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function budgetRow() {
  return {
    id: "goal-1",
    category: "Groceries",
    amountMinor: 100_00,
    period: "monthly",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  }
}

function expenseRow() {
  return {
    id: "tx-1",
    date: `${currentMonth()}-10`,
    description: "Acme Market",
    amountMinor: -8500,
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
    fingerprint: "fp-1",
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
  }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
  mocks.isNative.mockReturnValue(false)
  mocks.budgetsList.mockResolvedValue([budgetRow()])
  mocks.transactionsList.mockResolvedValue([expenseRow()])
  mocks.checkPermission.mockResolvedValue("granted")
  mocks.listPending.mockResolvedValue([])
  mocks.schedule.mockResolvedValue(undefined)
  mocks.cancel.mockResolvedValue(undefined)
})

describe("setRemindersEnabled", () => {
  it("toggle off cancels every pending reminder", async () => {
    mocks.isNative.mockReturnValue(true)
    window.localStorage.setItem("budgetlens.notifications.enabled", "1")
    const outcome = await setRemindersEnabled(false)
    expect(outcome).toEqual({ enabled: false, reason: "disabled" })
    expect(window.localStorage.getItem("budgetlens.notifications.enabled")).toBe("0")
    expect(mocks.cancel).toHaveBeenCalledTimes(1)
    expect(mocks.cancel).toHaveBeenCalledWith()
  })

  it("requests permission only when enabling, then syncs", async () => {
    mocks.isNative.mockReturnValue(true)
    mocks.requestPermission.mockResolvedValueOnce("granted")
    const outcome = await setRemindersEnabled(true)
    expect(mocks.requestPermission).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem("budgetlens.notifications.enabled")).toBe("1")
    expect(outcome).toMatchObject({ enabled: true })
    expect(mocks.schedule).toHaveBeenCalledTimes(1)
  })

  it("stays off when permission is denied and schedules nothing", async () => {
    mocks.isNative.mockReturnValue(true)
    mocks.requestPermission.mockResolvedValueOnce("denied")
    const outcome = await setRemindersEnabled(true)
    expect(outcome).toEqual({ enabled: false, reason: "denied" })
    expect(window.localStorage.getItem("budgetlens.notifications.enabled")).toBe("0")
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it("degrades on web without touching the plugin", async () => {
    const outcome = await setRemindersEnabled(true)
    expect(outcome).toEqual({ enabled: false, reason: "unsupported" })
    expect(mocks.requestPermission).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
  })
})
