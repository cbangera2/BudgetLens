import { render, screen } from "@testing-library/react"

import { buildTransaction } from "@/test/factories"

import type { TransferFlagActions } from "./store"
import { TransfersSection } from "./transfers-section"

const rows = [
  buildTransaction({
    id: "out",
    date: "2026-03-01",
    description: "Synthetic transfer out",
    amountMinor: -25_000,
    category: "Transfer",
    transactionType: "Debit",
    accountName: "Everyday Checking",
  }),
  buildTransaction({
    id: "in",
    date: "2026-03-02",
    description: "Synthetic transfer in",
    amountMinor: 25_000,
    category: "Transfer",
    transactionType: "Credit",
    accountName: "Beacon Savings",
  }),
  buildTransaction({
    id: "grocery",
    date: "2026-03-05",
    description: "Synthetic Groceries",
    amountMinor: -4_250,
    category: "Groceries",
    accountName: "Everyday Checking",
  }),
]

function stubActions(confirmed: readonly string[] = []): TransferFlagActions {
  return {
    flags: Object.fromEntries(confirmed.map((id) => [id, "confirmed"] as const)),
    confirmedIds: new Set(confirmed),
    dismissedIds: new Set(),
    confirmPair: () => undefined,
    dismissPair: () => undefined,
    clearFlag: () => undefined,
  }
}

describe("transfers section", () => {
  it("excludes a fully confirmed pair from spending", () => {
    render(<TransfersSection transactions={rows} flagActions={stubActions(["out", "in"])} />)
    expect(screen.getByText(/42\.50/)).toBeVisible()
    expect(screen.getByText(/excluded 2 transfer rows/)).toBeVisible()
  })

  it("ignores an orphaned confirmation that no longer forms a pair", () => {
    const withoutIncome = rows.filter((row) => row.id !== "in")
    render(
      <TransfersSection transactions={withoutIncome} flagActions={stubActions(["out", "in"])} />,
    )
    expect(screen.getByText(/No transfers detected yet/)).toBeVisible()
    expect(screen.getByText(/292\.50/)).toBeVisible()
    expect(screen.getByText(/excluded 0 transfer rows/)).toBeVisible()
  })
})
