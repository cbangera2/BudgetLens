import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NotificationsSettingsCard } from "@/features/notifications/notifications-toggle"
import { NOTIFICATIONS_ENABLED_KEY } from "@/features/notifications/preferences"

const mocks = vi.hoisted(() => ({
  isNative: vi.fn<() => boolean>(() => false),
  checkPermission: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  setEnabled: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  ensureSync: vi.fn<() => () => void>(() => () => undefined),
}))

vi.mock("@/lib/native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/native")>()
  return {
    ...actual,
    isNative: mocks.isNative,
    checkReminderPermission: mocks.checkPermission,
  }
})

vi.mock("@/features/notifications/scheduler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/notifications/scheduler")>()
  return {
    ...actual,
    setRemindersEnabled: mocks.setEnabled,
    ensureReminderStoreSync: mocks.ensureSync,
  }
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.clearAllMocks()
  mocks.isNative.mockReturnValue(false)
})

describe("NotificationsSettingsCard", () => {
  it("is OFF by default on web with unsupported copy", () => {
    render(<NotificationsSettingsCard />)
    const checkbox = screen.getByRole("checkbox", { name: /send reminders on this device/i })
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toBeDisabled()
    expect(screen.getByText(/reminders need the budgetlens iphone app/i)).toBeInTheDocument()
    expect(mocks.checkPermission).not.toHaveBeenCalled()
  })

  it("explains the denied state on native", async () => {
    mocks.isNative.mockReturnValue(true)
    mocks.checkPermission.mockResolvedValueOnce("denied")
    mocks.setEnabled.mockResolvedValueOnce({ enabled: false, reason: "denied" })
    const user = userEvent.setup()
    render(<NotificationsSettingsCard />)
    const checkbox = screen.getByRole("checkbox", { name: /send reminders on this device/i })
    expect(checkbox).toBeEnabled()
    await user.click(checkbox)
    expect(mocks.setEnabled).toHaveBeenCalledWith(true)
    expect(await screen.findByText(/enable them in ios settings/i)).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
  })

  it("shows revoked permission on mount even with a stored on-preference", async () => {
    mocks.isNative.mockReturnValue(true)
    mocks.checkPermission.mockResolvedValueOnce("denied")
    window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "1")
    render(<NotificationsSettingsCard />)
    expect(await screen.findByText(/enable them in ios settings/i)).toBeInTheDocument()
    expect(
      screen.getByRole("checkbox", { name: /send reminders on this device/i }),
    ).not.toBeChecked()
  })

  it("turns off again on native", async () => {
    mocks.isNative.mockReturnValue(true)
    mocks.checkPermission.mockResolvedValueOnce("granted")
    mocks.setEnabled.mockResolvedValueOnce({ enabled: false, reason: "disabled" })
    window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "1")
    const user = userEvent.setup()
    render(<NotificationsSettingsCard />)
    const checkbox = screen.getByRole("checkbox", { name: /send reminders on this device/i })
    expect(checkbox).toBeChecked()
    await user.click(checkbox)
    expect(mocks.setEnabled).toHaveBeenCalledWith(false)
    expect(checkbox).not.toBeChecked()
  })
})
