import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach } from "vitest"

import { App } from "@/app/app"
import { SIDEBAR_PREFERENCE_KEY } from "@/app/app-shell"
import { router } from "@/app/router"
import { recordOnboardingChoice } from "@/features/onboarding/onboarding-storage"

describe("BudgetLens application shell", () => {
  beforeEach(() => {
    // Shell tests run as returning users; the welcome screen has its own suite.
    recordOnboardingChoice(window.localStorage, "empty")
  })
  it("renders the primary navigation and private local-first message", async () => {
    window.history.replaceState({}, "", "/")
    render(<App />)

    expect(
      await screen.findByRole("heading", { name: "Overview" }, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument()
    expect(screen.getByText(/without sending financial data to a server/i)).toBeInTheDocument()
  })

  it("renders shared resource links and version metadata", async () => {
    window.history.replaceState({}, "", "/transactions")
    render(<App />)

    expect(
      await screen.findByRole("heading", { name: "Transactions" }, { timeout: 3_000 }),
    ).toBeInTheDocument()

    const footer = screen.getByRole("contentinfo", { name: "BudgetLens resources" })
    const budgetLensLink = screen.getByRole("link", { name: "GitHub" })
    const issueLink = screen.getByRole("link", { name: "Report an issue" })
    const resourceLinks = screen.getAllByRole("link").filter((link) => footer.contains(link))

    expect(footer).toContainElement(budgetLensLink)
    expect(budgetLensLink).toHaveAttribute("href", "https://github.com/cbangera2/BudgetLens")
    expect(issueLink).toHaveAttribute("href", "https://github.com/cbangera2/BudgetLens/issues")

    expect(resourceLinks).toHaveLength(3)
    for (const link of resourceLinks) {
      expect(link).toHaveAttribute("target", "_blank")
      expect(link).toHaveAttribute("rel", "noopener noreferrer")
    }

    expect(footer).toHaveTextContent("BudgetLens v1.0.0")
    expect(footer).not.toHaveTextContent("Not affiliated with Credit Karma")
    expect(footer).not.toHaveTextContent("Credit Karma transactions")
    expect(footer).not.toHaveTextContent("TMOAP")
  })

  it("collapses the desktop navigation without hiding accessible link names", async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, "", "/")
    render(<App />)

    const collapseButton = await screen.findByRole("button", { name: "Collapse navigation" })
    expect(collapseButton).toHaveAttribute("aria-expanded", "true")

    await user.click(collapseButton)

    const expandButton = screen.getByRole("button", { name: "Expand navigation" })
    expect(expandButton).toHaveAttribute("title", "Expand navigation")
    expect(expandButton).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("title", "Overview")
    expect(screen.getByRole("link", { name: "Transactions" })).toBeInTheDocument()
    expect(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY)).toBe(
      JSON.stringify({ collapsed: true }),
    )
  })

  it("restores the collapsed preference after remount and preserves route navigation", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, JSON.stringify({ collapsed: true }))
    // The router is a module singleton shared by every test in this file, and
    // window.history.replaceState does not notify its history subscriber, so
    // reset through the router for deterministic starting state.
    router.history.replace("/")
    render(<App />)

    expect(await screen.findByRole("button", { name: "Expand navigation" })).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Imports" }))
    // Navigation-readiness gate: /imports is a lazyRouteComponent, so the
    // router settles on the new pathname before its chunk renders. Waiting on
    // router state (not wall-clock time) fixes the intermittent
    // heading-not-found under parallel-worker load; the findBy below keeps
    // the same 3s budget as the sibling tests for the lazy chunk itself.
    await waitFor(() => expect(router.state.location.pathname).toBe("/imports"))
    expect(
      await screen.findByRole("heading", { name: "Import Credit Karma data" }, { timeout: 3_000 }),
    ).toBeInTheDocument()

    cleanup()
    // The remount reuses the same singleton router, still parked at /imports;
    // re-assert through the router so the second mount starts settled.
    router.history.replace("/imports")
    render(<App />)

    expect(await screen.findByRole("button", { name: "Expand navigation" })).toBeInTheDocument()
  })

  it("falls back to expanded navigation when its saved preference is malformed", async () => {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, "not-json")
    window.history.replaceState({}, "", "/")
    render(<App />)

    expect(await screen.findByRole("button", { name: "Collapse navigation" })).toBeInTheDocument()
  })
})
