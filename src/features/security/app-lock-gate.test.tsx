import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { APP_LOCK_KEY } from "@/features/security/app-lock"
import { AppLockGate } from "@/features/security/app-lock-gate"

vi.mock("@aparajita/capacitor-biometric-auth", () => ({
  BiometricAuth: {
    authenticate: vi.fn<() => Promise<void>>(async () => undefined),
    checkBiometry: vi.fn<() => Promise<unknown>>(async () => ({
      isAvailable: true,
      biometryType: "faceID",
    })),
  },
}))

declare global {
  interface Window {
    webkit?: { messageHandlers?: { bridge?: unknown } } | undefined
  }
}

afterEach(() => {
  window.webkit = undefined
  window.localStorage.removeItem(APP_LOCK_KEY)
  vi.restoreAllMocks()
})

describe("AppLockGate", () => {
  it("renders children directly when the lock is off", () => {
    render(
      <AppLockGate>
        <p>dashboard</p>
      </AppLockGate>,
    )
    expect(screen.getByText("dashboard")).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "BudgetLens is locked" })).toBeNull()
  })

  it("renders children directly on web even with the lock stored", () => {
    window.localStorage.setItem(APP_LOCK_KEY, '"biometric"')
    render(
      <AppLockGate>
        <p>dashboard</p>
      </AppLockGate>,
    )
    expect(screen.getByText("dashboard")).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "BudgetLens is locked" })).toBeNull()
  })

  it("locks on native until biometric unlock succeeds", async () => {
    window.webkit = { messageHandlers: { bridge: {} } }
    window.localStorage.setItem(APP_LOCK_KEY, '"biometric"')
    const user = userEvent.setup()
    render(
      <AppLockGate>
        <p>dashboard</p>
      </AppLockGate>,
    )
    screen.getByRole("dialog", { name: "BudgetLens is locked" })
    await user.click(screen.getByRole("button", { name: "Unlock" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "BudgetLens is locked" })).toBeNull()
    })
    expect(screen.getByText("dashboard")).toBeInTheDocument()
  })
})
