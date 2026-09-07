import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { defaultTransactionFilters, type TransactionViewFilters } from "./filtering"
import { TransactionFilterBar } from "./transaction-filter-bar"

const baseProps = {
  groups: [{ id: "g1", name: "Trip" }],
  merchantOptions: ["Corner Deli", "Big Box Mart"],
  categoryOptions: ["Dining", "Groceries"],
  accountOptions: ["Everyday Checking"],
  providerOptions: ["Sample Credit Union"],
  transactionTypeOptions: ["Debit", "Credit"],
  onPatch: () => undefined,
  onApply: () => undefined,
  onReset: () => undefined,
}

function renderBar(filters: TransactionViewFilters = defaultTransactionFilters) {
  return render(<TransactionFilterBar filters={filters} {...baseProps} />)
}

describe("TransactionFilterBar progressive disclosure", () => {
  it("collapses advanced controls by default, keeping search, dates, and toggle visible", () => {
    renderBar()

    expect(screen.getByLabelText("Search")).toBeVisible()
    expect(screen.getByRole("button", { name: "Last 30 days" })).toBeVisible()
    expect(screen.getByRole("button", { name: "All" })).toBeVisible()
    expect(screen.getByLabelText("From date")).toBeVisible()
    expect(screen.getByLabelText("To date")).toBeVisible()

    const toggle = screen.getByRole("button", { name: "More filters" })
    expect(toggle).toBeVisible()
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-controls", "more-filters")

    expect(screen.queryByLabelText("Saved views")).toBeNull()
    expect(screen.queryByText(/Tip: use amount/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Merchant" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Category" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Provider" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Transaction type" })).toBeNull()
    expect(screen.queryByLabelText("Group")).toBeNull()
    expect(screen.queryByLabelText("Sort")).toBeNull()
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull()
  })

  it("expands and collapses through the Filters toggle", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: "More filters" }))

    const toggle = screen.getByRole("button", { name: "Fewer filters" })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByLabelText("Saved views")).toBeVisible()
    expect(screen.getByText(/Tip: use amount/)).toBeVisible()

    await user.click(toggle)
    expect(screen.getByRole("button", { name: "More filters" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
    expect(screen.queryByLabelText("Saved views")).toBeNull()
  })

  it("preserves open state across filter interactions within the session", async () => {
    const user = userEvent.setup()
    function Harness() {
      const [filters, setFilters] = useState(defaultTransactionFilters)
      return (
        <TransactionFilterBar
          filters={filters}
          groups={baseProps.groups}
          merchantOptions={baseProps.merchantOptions}
          categoryOptions={baseProps.categoryOptions}
          accountOptions={baseProps.accountOptions}
          providerOptions={baseProps.providerOptions}
          transactionTypeOptions={baseProps.transactionTypeOptions}
          onPatch={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onApply={setFilters}
          onReset={() => setFilters(defaultTransactionFilters)}
        />
      )
    }
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "More filters" }))
    await user.type(screen.getByLabelText("Search"), "deli")

    expect(screen.getByLabelText("Search")).toHaveValue("deli")
    expect(screen.getByRole("button", { name: "Fewer filters" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(screen.getByLabelText("Saved views")).toBeVisible()
    expect(screen.getByText(/Tip: use amount/)).toBeVisible()
  })

  it("keeps every filter control reachable when expanded without changing labels", async () => {
    const user = userEvent.setup()
    renderBar()

    await user.click(screen.getByRole("button", { name: "More filters" }))

    expect(screen.getByLabelText("Search")).toBeVisible()
    expect(screen.getByRole("button", { name: "Last 30 days" })).toBeVisible()
    expect(screen.getByLabelText("Saved views")).toBeVisible()
    expect(screen.getByRole("button", { name: "Save view" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Merchant" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Category" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Account" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Provider" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Transaction type" })).toBeVisible()
    expect(screen.getByLabelText("Group")).toBeVisible()
    expect(screen.getByLabelText("Sort")).toBeVisible()
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible()
  })
})
