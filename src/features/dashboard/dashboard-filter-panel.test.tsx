import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import type { Transaction } from "@/domain/models"

import { DashboardFilterPanel, type DashboardFilters } from "./dashboard-page"

const transactions: Transaction[] = [
  {
    id: "transaction-1",
    date: "2026-04-02",
    description: "Corner Market",
    amountMinor: 4525,
    category: "Groceries",
    transactionType: "Debit",
    accountName: "Checking",
    accountType: "Banking",
    provider: "Example",
    labels: [],
    notes: null,
    importBatchId: "batch-1",
    fingerprint: "fingerprint-1",
    createdAt: "2026-04-02T12:00:00.000Z",
    updatedAt: "2026-04-02T12:00:00.000Z",
  },
]

const activeFilters: DashboardFilters = {
  query: "market",
  category: "Groceries",
  transactionType: "Debit",
  startDate: "2026-04-01",
  endDate: "2026-04-30",
}

function FilterHarness() {
  const [filters, setFilters] = useState(activeFilters)
  return (
    <DashboardFilterPanel transactions={transactions} filters={filters} onChange={setFilters} />
  )
}

describe("DashboardFilterPanel", () => {
  it("keeps every filter accessible in the compact toolbar and resets them together", async () => {
    const user = userEvent.setup()
    render(<FilterHarness />)

    expect(screen.getByRole("region", { name: "Dashboard filters" })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("market")
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Groceries")
    expect(screen.getByRole("combobox", { name: "Transaction type" })).toHaveTextContent("Debit")
    expect(screen.getByRole("button", { name: "Start date" })).toHaveTextContent("Apr 1, 2026")
    expect(screen.getByRole("button", { name: "End date" })).toHaveTextContent("Apr 30, 2026")

    const reset = screen.getByRole("button", { name: "Reset" })
    await user.click(reset)

    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("")
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("All categories")
    expect(screen.getByRole("combobox", { name: "Transaction type" })).toHaveTextContent(
      "All types",
    )
    expect(screen.getByRole("button", { name: "Start date" })).toHaveTextContent("Start date")
    expect(screen.getByRole("button", { name: "End date" })).toHaveTextContent("End date")
    expect(reset).toBeDisabled()
  })
})
