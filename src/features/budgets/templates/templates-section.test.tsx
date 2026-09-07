import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { BudgetGoal, Transaction } from "@/domain/models"

const mocks = vi.hoisted(() => ({
  listBudgets: vi.fn<() => Promise<BudgetGoal[]>>(),
  listTransactions: vi.fn<() => Promise<Transaction[]>>(),
  put: vi.fn<(goal: BudgetGoal) => Promise<BudgetGoal>>(),
  remove: vi.fn<(id: string) => Promise<void>>(),
}))

vi.mock("@/db/repositories", () => ({
  repositories: {
    budgets: { list: mocks.listBudgets, put: mocks.put, remove: mocks.remove },
    transactions: { list: mocks.listTransactions },
  },
}))

import { TemplatesSection } from "./templates-section"

describe("TemplatesSection single-flight apply", () => {
  beforeEach(() => {
    mocks.listBudgets.mockResolvedValue([])
    mocks.listTransactions.mockResolvedValue([])
  })

  it("ignores a second apply while the first is still writing", async () => {
    let releasePuts!: () => void
    const putsGate = new Promise<void>((resolve) => {
      releasePuts = resolve
    })
    mocks.put.mockImplementation(async (goal) => {
      await putsGate
      return goal
    })
    const user = userEvent.setup()
    render(<TemplatesSection goals={[]} transactions={[]} />)

    await user.type(screen.getByLabelText("Monthly income"), "3000")
    const apply = await screen.findByRole("button", { name: /Apply template/ })
    // No expense history: the fallback plans Needs, Wants, and Savings.
    expect(apply).toHaveAccessibleName("Apply template (3)")

    await user.click(apply)
    expect(await screen.findByRole("button", { name: "Applying…" })).toBeDisabled()
    // Second click while pending must not start another write batch.
    await user.click(screen.getByRole("button", { name: "Applying…" }))
    releasePuts()
    await screen.findByText("Created 3 goals.")
    expect(mocks.put).toHaveBeenCalledTimes(3)
  })
})
