import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { BudgetGoal, Transaction } from "@/domain/models"

const mocks = vi.hoisted(() => ({
  listBudgets: vi.fn<() => Promise<BudgetGoal[]>>(),
  listTransactions: vi.fn<() => Promise<Transaction[]>>(),
  put: vi.fn<(goal: BudgetGoal) => Promise<void>>(),
  remove: vi.fn<(id: string) => Promise<void>>(),
}))

vi.mock("@/db/repositories", () => ({
  repositories: {
    budgets: { list: mocks.listBudgets, put: mocks.put, remove: mocks.remove },
    transactions: { list: mocks.listTransactions },
  },
}))

import { saveBudgetFormDefaults } from "./budget-form-defaults"
import { BudgetsPageContent } from "./budgets-page"

// Goal cards link to /transactions, so the page needs a router context.
function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  })
  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, transactionsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

const GOAL: BudgetGoal = {
  id: "goal-groceries",
  category: "Groceries",
  amountMinor: 25_000,
  period: "monthly",
  createdAt: "2026-07-01T12:00:00.000Z",
  updatedAt: "2026-07-01T12:00:00.000Z",
}

describe("BudgetsPageContent period default", () => {
  beforeEach(() => {
    mocks.listBudgets.mockResolvedValue([])
    mocks.listTransactions.mockResolvedValue([])
    mocks.put.mockResolvedValue(undefined)
    mocks.remove.mockResolvedValue(undefined)
  })

  it("prefills the last-used period when adding a goal", async () => {
    const user = userEvent.setup()
    saveBudgetFormDefaults("yearly", window.localStorage)
    renderWithRouter(<BudgetsPageContent />)

    await user.click(await screen.findByRole("button", { name: "Add goal" }))
    expect(await screen.findByLabelText("Period")).toHaveValue("yearly")
  })

  it("never overwrites an explicit period choice and remembers it", async () => {
    const user = userEvent.setup()
    saveBudgetFormDefaults("yearly", window.localStorage)
    renderWithRouter(<BudgetsPageContent />)

    await user.click(await screen.findByRole("button", { name: "Add goal" }))
    const form = (await screen.findByLabelText("Period")).closest("form")!
    await user.selectOptions(within(form).getByLabelText("Period"), "monthly")
    // Interacting with other fields must not restore the stored default.
    await user.type(within(form).getByLabelText("Category"), "Dining")
    await user.type(within(form).getByLabelText("Goal amount"), "120")
    expect(within(form).getByLabelText("Period")).toHaveValue("monthly")

    await user.click(within(form).getByRole("button", { name: "Save goal" }))
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ period: "monthly" }))
    expect(window.localStorage.getItem("budgetlens.budget-form-defaults.v1")).toContain(
      '"period":"monthly"',
    )
  })

  it("leaves the edit form on the goal's own period", async () => {
    const user = userEvent.setup()
    mocks.listBudgets.mockResolvedValue([GOAL])
    saveBudgetFormDefaults("yearly", window.localStorage)
    renderWithRouter(<BudgetsPageContent />)

    await user.click(await screen.findByRole("button", { name: "Edit Groceries budget" }))
    const form = (await screen.findByLabelText("Period")).closest("form")!
    expect(within(form).getByLabelText("Period")).toHaveValue("monthly")
  })
})
