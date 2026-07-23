import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { App } from "@/app/app"
import { SIDEBAR_PREFERENCE_KEY } from "@/app/app-shell"

describe("BudgetLens application shell", () => {
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

    expect(await screen.findByRole("heading", { name: "Transactions" })).toBeInTheDocument()

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
    window.history.replaceState({}, "", "/")
    render(<App />)

    expect(await screen.findByRole("button", { name: "Expand navigation" })).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Imports" }))
    expect(await screen.findByRole("heading", { name: "Import data" })).toBeInTheDocument()

    cleanup()
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
