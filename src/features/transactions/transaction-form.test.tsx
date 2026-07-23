import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { TransactionDraft } from "@/domain/models"

import { TransactionForm } from "./transaction-form"
import { valuesToDraft } from "./transaction-form"

describe("transaction form validation", () => {
  const valid = {
    date: "2026-07-22",
    description: " Example ",
    amount: "-12.345",
    category: " Dining ",
    transactionType: "Debit",
    accountName: "Card",
    accountType: "Credit",
    provider: "Bank",
    notes: "",
  }
  it("normalizes values and rounds to integer minor units", () => {
    expect(valuesToDraft(valid)).toMatchObject({
      description: "Example",
      amountMinor: -1235,
      category: "Dining",
      notes: null,
    })
  })
  it("rejects missing required and zero values", () => {
    expect(valuesToDraft({ ...valid, description: "" })).toBeNull()
    expect(valuesToDraft({ ...valid, amount: "0" })).toBeNull()
    expect(valuesToDraft({ ...valid, date: "7/22/2026" })).toBeNull()
  })
})

describe("TransactionForm", () => {
  it("reports invalid input without calling the repository action", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn<(draft: TransactionDraft) => Promise<void>>()
    render(<TransactionForm onSubmit={onSubmit} onCancel={vi.fn<() => void>()} />)

    await user.click(screen.getByRole("button", { name: "Add transaction" }))
    expect(screen.getByRole("alert")).toHaveTextContent(/valid date, description/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits normalized values from accessible labeled controls", async () => {
    const user = userEvent.setup()
    const onSubmit = vi
      .fn<(draft: TransactionDraft) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(<TransactionForm onSubmit={onSubmit} onCancel={vi.fn<() => void>()} />)

    await user.type(screen.getByLabelText("Date"), "2026-07-22")
    await user.type(screen.getByLabelText("Description"), "Lunch")
    await user.type(screen.getByLabelText("Amount"), "-18.50")
    await user.type(screen.getByLabelText("Category"), "Dining")
    await user.click(screen.getByRole("button", { name: "Add transaction" }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-07-22",
        description: "Lunch",
        amountMinor: -1_850,
        category: "Dining",
      }),
    )
  })
})
