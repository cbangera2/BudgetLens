import { afterEach, describe, expect, it, vi } from "vitest"

import {
  cancelReminderNotifications,
  checkReminderPermission,
  listPendingReminderKeys,
  reminderNumericId,
  requestReminderPermission,
  scheduleReminderNotifications,
} from "@/lib/native"

const mocks = vi.hoisted(() => ({
  checkPermissions: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  requestPermissions: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  schedule: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cancel: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cancelAll: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  getPending: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    schedule: mocks.schedule,
    cancel: mocks.cancel,
    cancelAll: mocks.cancelAll,
    getPending: mocks.getPending,
  },
}))

declare global {
  interface Window {
    webkit?: { messageHandlers?: { bridge?: unknown } } | undefined
  }
}

function simulateNativeBridge(): void {
  window.webkit = { messageHandlers: { bridge: {} } }
}

afterEach(() => {
  window.webkit = undefined
  vi.clearAllMocks()
})

describe("reminderNumericId", () => {
  it("is stable, positive, and a 32-bit int", () => {
    const first = reminderNumericId("budget:Groceries:2026-09:80")
    expect(first).toBe(reminderNumericId("budget:Groceries:2026-09:80"))
    expect(Number.isInteger(first)).toBe(true)
    expect(first).toBeGreaterThanOrEqual(1)
    expect(first).toBeLessThanOrEqual(2_147_483_647)
    expect(reminderNumericId("bill:acme:2026-09-13")).not.toBe(first)
  })

  it("hashes full code units so unicode keys do not fold together", () => {
    expect(reminderNumericId("budget:Ł:2026-09:80")).not.toBe(
      reminderNumericId("budget:A:2026-09:80"),
    )
  })
})

describe("reminder bridge on web", () => {
  it("leaves the plugin untouched", async () => {
    await expect(checkReminderPermission()).resolves.toBe("denied")
    await expect(requestReminderPermission()).resolves.toBe("denied")
    await expect(
      scheduleReminderNotifications([{ key: "budget:x:2026-09:80", title: "t", body: "b" }]),
    ).resolves.toBeUndefined()
    await expect(cancelReminderNotifications()).resolves.toBeUndefined()
    await expect(cancelReminderNotifications([1])).resolves.toBeUndefined()
    await expect(listPendingReminderKeys()).resolves.toEqual([])
    expect(mocks.checkPermissions).not.toHaveBeenCalled()
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(mocks.cancelAll).not.toHaveBeenCalled()
    expect(mocks.getPending).not.toHaveBeenCalled()
  })
})

describe("reminder bridge on native", () => {
  it("checks and requests permission through the plugin", async () => {
    simulateNativeBridge()
    mocks.checkPermissions.mockResolvedValueOnce({ display: "granted" })
    await expect(checkReminderPermission()).resolves.toBe("granted")
    mocks.requestPermissions.mockResolvedValueOnce({ display: "denied" })
    await expect(requestReminderPermission()).resolves.toBe("denied")
  })

  it("schedules with numeric ids and engine keys in extra", async () => {
    simulateNativeBridge()
    mocks.schedule.mockResolvedValueOnce({ notifications: [{ id: 1 }] })
    await scheduleReminderNotifications([
      { key: "budget:Groceries:2026-09:80", title: "At 80%", body: "Almost there" },
    ])
    expect(mocks.schedule).toHaveBeenCalledTimes(1)
    expect(mocks.schedule).toHaveBeenCalledWith({
      notifications: [
        {
          id: reminderNumericId("budget:Groceries:2026-09:80"),
          title: "At 80%",
          body: "Almost there",
          extra: { reminderKey: "budget:Groceries:2026-09:80" },
        },
      ],
    })
  })

  it("skips empty schedules without touching the plugin", async () => {
    simulateNativeBridge()
    await scheduleReminderNotifications([])
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it("cancels ids explicitly and everything by default", async () => {
    simulateNativeBridge()
    mocks.cancel.mockResolvedValueOnce(undefined)
    await cancelReminderNotifications([3, 4])
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 3 }, { id: 4 }] })
    mocks.cancelAll.mockResolvedValueOnce(undefined)
    await cancelReminderNotifications()
    expect(mocks.cancelAll).toHaveBeenCalledTimes(1)
  })

  it("recovers engine keys from pending extras", async () => {
    simulateNativeBridge()
    mocks.getPending.mockResolvedValueOnce({
      notifications: [
        { id: 11, title: "t", body: "b", extra: { reminderKey: "budget:x:2026-09:50" } },
        { id: 12, title: "t", body: "b" },
      ],
    })
    await expect(listPendingReminderKeys()).resolves.toEqual([
      { id: 11, key: "budget:x:2026-09:50" },
      { id: 12, key: null },
    ])
  })

  it("propagates native failures so the scheduler can report them", async () => {
    simulateNativeBridge()
    mocks.schedule.mockRejectedValueOnce(new Error("denied"))
    await expect(
      scheduleReminderNotifications([{ key: "k", title: "t", body: "b" }]),
    ).rejects.toThrow("denied")
  })
})
