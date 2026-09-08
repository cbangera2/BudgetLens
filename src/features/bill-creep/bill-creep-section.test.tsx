import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { buildTransaction } from "@/test/factories"

import { BillCreepSection } from "./bill-creep-section"
import { resetCreepStoreSyncForTests } from "./creep-notifications"
import { BILL_CREEP_DISMISSALS_KEY, loadDismissedCreepKeys } from "./dismissals"

function monthly(idPrefix: string, description: string, amounts: number[]) {
  return amounts.map((amountMinor, index) =>
    buildTransaction({
      id: `${idPrefix}-${index}`,
      date: `2026-0${index + 1}-15`,
      description,
      amountMinor,
      transactionType: "Debit",
    }),
  )
}

const transactions = [
  ...monthly("up", "Acme Streaming", [-1000, -1000, -1000, -1200]),
  ...monthly("flat", "Example News", [-900, -900, -900, -900]),
]

afterEach(() => {
  resetCreepStoreSyncForTests()
})

describe("BillCreepSection", () => {
  it("lists the creep with old-to-new figures and the first-seen date", async () => {
    render(<BillCreepSection transactions={transactions} />)
    const section = await screen.findByRole("region", { name: "Bill creep" })
    expect(section).toHaveTextContent("Acme Streaming")
    expect(section).toHaveTextContent("$10.00 → $12.00")
    expect(section).toHaveTextContent("+20%")
    expect(section).toHaveTextContent("+$2.00")
    expect(section).toHaveTextContent("2026-01-15")
    expect(within(section).queryByText("Example News")).not.toBeInTheDocument()
  })

  it("shows an empty state without creeps", async () => {
    render(
      <BillCreepSection transactions={monthly("flat", "Example News", [-900, -900, -900, -900])} />,
    )
    expect(await screen.findByText("No bill increases detected.")).toBeInTheDocument()
  })

  it("dismisses a creep, persists it, and restores it", async () => {
    const user = userEvent.setup()
    const first = render(<BillCreepSection transactions={transactions} />)
    await screen.findByRole("region", { name: "Bill creep" })

    await user.click(screen.getByRole("button", { name: "Dismiss Acme Streaming bill creep" }))
    expect(screen.queryByText(/\$10\.00 → \$12\.00/)).not.toBeInTheDocument()
    expect(loadDismissedCreepKeys()).toEqual(new Set(["acme streaming"]))
    expect(window.localStorage.getItem(BILL_CREEP_DISMISSALS_KEY)).toContain("acme streaming")
    first.unmount()

    render(<BillCreepSection transactions={transactions} />)
    await screen.findByRole("region", { name: "Bill creep" })
    expect(screen.queryByText(/\$10\.00 → \$12\.00/)).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Dismissed increases" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Restore Acme Streaming bill creep" }))
    expect(screen.getByText(/\$10\.00 → \$12\.00/)).toBeInTheDocument()
    expect(loadDismissedCreepKeys()).toEqual(new Set())
  })
})
