import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { OnboardingGate } from "@/features/onboarding/onboarding-gate"
import { ONBOARDING_STORAGE_KEY } from "@/features/onboarding/onboarding-storage"

vi.mock("@/features/demo/demo-seed", () => ({
  seedDemoDataIfEmpty: vi.fn<() => Promise<boolean>>(async () => true),
}))

vi.mock("@/app/router", () => ({
  router: { navigate: vi.fn<(options: { to: string }) => Promise<void>>(async () => undefined) },
}))

import { router } from "@/app/router"
import { seedDemoDataIfEmpty } from "@/features/demo/demo-seed"
import { readOnboardingChoice } from "@/features/onboarding/onboarding-storage"

const navigate = vi.mocked(router.navigate)
const seedDemo = vi.mocked(seedDemoDataIfEmpty)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderGate() {
  return render(
    <OnboardingGate>
      <h1>Overview</h1>
    </OnboardingGate>,
  )
}

describe("OnboardingGate", () => {
  it("shows the welcome screen once on first launch", async () => {
    renderGate()

    expect(await screen.findByTestId("onboarding-screen")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Welcome to BudgetLens" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Explore demo data" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import my files" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start empty" })).toBeInTheDocument()
  })

  it("seeds demo data and proceeds when demo is chosen", async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole("button", { name: "Explore demo data" }))

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(screen.queryByTestId("onboarding-screen")).not.toBeInTheDocument()
    expect(seedDemo).toHaveBeenCalledTimes(1)
    expect(readOnboardingChoice(window.localStorage)).toBe("demo")
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toContain('"version":1')
  })

  it("keeps onboarding visible with a retry when demo seeding fails", async () => {
    const user = userEvent.setup()
    seedDemo.mockRejectedValueOnce(new Error("storage unavailable"))
    renderGate()

    await user.click(await screen.findByRole("button", { name: "Explore demo data" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/i)
    expect(screen.getByTestId("onboarding-screen")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument()
    expect(seedDemo).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Explore demo data" }))

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(seedDemo).toHaveBeenCalledTimes(2)
  })

  it("routes to imports when the import choice is selected", async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole("button", { name: "Import my files" }))

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith({ to: "/imports" })
    expect(seedDemo).not.toHaveBeenCalled()
    expect(readOnboardingChoice(window.localStorage)).toBe("import")
  })

  it("proceeds with a clean store when empty is chosen", async () => {
    const user = userEvent.setup()
    renderGate()

    await user.click(await screen.findByRole("button", { name: "Start empty" }))

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(seedDemo).not.toHaveBeenCalled()
    expect(readOnboardingChoice(window.localStorage)).toBe("empty")
  })

  it("never shows the welcome screen to returning users", async () => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ version: 1, choice: "empty", completedAt: "2026-01-01T00:00:00.000Z" }),
    )
    renderGate()

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(screen.queryByTestId("onboarding-screen")).not.toBeInTheDocument()
    expect(seedDemo).not.toHaveBeenCalled()
  })

  it("reprompts when the stored record uses an unknown version", async () => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ version: 2, choice: "demo", completedAt: "2026-01-01T00:00:00.000Z" }),
    )
    renderGate()

    expect(await screen.findByTestId("onboarding-screen")).toBeInTheDocument()
  })
})
