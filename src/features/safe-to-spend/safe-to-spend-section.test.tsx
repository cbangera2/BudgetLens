import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { BudgetGoal } from "@/domain/models"
import { buildTransaction } from "@/test/factories"

import { SafeToSpendSection } from "./safe-to-spend-section"

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  })
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      stub("/transactions"),
      stub("/bills"),
      stub("/budgets"),
      stub("/imports"),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

function goal(category: string, amountMinor: number) {
  return {
    id: `goal-${category}`,
    category,
    amountMinor,
    period: "monthly",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies BudgetGoal
}

const paycheck = buildTransaction({
  id: "pay",
  date: "2026-09-01",
  description: "Synthetic Paycheck",
  amountMinor: 300_000,
  category: "Income",
  transactionType: "Credit",
})

describe("SafeToSpendSection", () => {
  it("renders the hero number and expands the breakdown with backing links", async () => {
    renderWithRouter(
      <SafeToSpendSection
        transactions={[paycheck]}
        goals={[goal("Groceries", 48_700)]}
        today="2026-09-10"
      />,
    )

    expect(await screen.findByRole("region", { name: "Safe to spend" })).toBeInTheDocument()
    // $3,000.00 income, no bills, $320.00 burn over 20 days left.
    expect(screen.getByTestId("safe-to-spend-amount")).toHaveTextContent("$2,680.00")

    const toggle = screen.getByRole("button", { name: "How this is calculated" })
    expect(screen.queryByTestId("safe-to-spend-math")).toBeNull()
    fireEvent.click(toggle)

    expect(screen.getByTestId("safe-to-spend-math")).toHaveTextContent(
      "$3,000.00 − $0.00 − $320.00 = $2,680.00 (floored at $0)",
    )
    expect(screen.getByText(/Safe-to-spend = income received this month/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View transactions" })).toHaveAttribute(
      "href",
      "/transactions",
    )
    expect(screen.getByRole("link", { name: "View bills" })).toHaveAttribute("href", "/bills")
    expect(screen.getByRole("link", { name: "View budgets" })).toHaveAttribute("href", "/budgets")
  })

  it("explains what is missing when no income arrived yet", async () => {
    renderWithRouter(
      <SafeToSpendSection
        transactions={[]}
        goals={[goal("Groceries", 48_700)]}
        today="2026-09-10"
      />,
    )

    expect(await screen.findByRole("region", { name: "Safe to spend" })).toBeInTheDocument()
    expect(screen.getByTestId("safe-to-spend-amount")).toHaveTextContent("$0.00")
    expect(screen.getByText(/No income recorded yet this month/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Import a paycheck" })).toHaveAttribute(
      "href",
      "/imports",
    )
  })

  it("notes the trailing-average fallback when no budgets are set", async () => {
    renderWithRouter(<SafeToSpendSection transactions={[paycheck]} goals={[]} today="2026-09-10" />)

    expect(await screen.findByRole("region", { name: "Safe to spend" })).toBeInTheDocument()
    expect(screen.getByText(/trailing 30-day average daily spend/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Set a budget" })).toHaveAttribute("href", "/budgets")
  })
})
