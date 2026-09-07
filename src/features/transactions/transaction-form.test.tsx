import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { Transaction, TransactionDraft } from "@/domain/models"

import { TransactionForm } from "./transaction-form"
import { valuesToDraft } from "./transaction-form"
import { saveTransactionFormDefaults } from "./transaction-form-defaults"

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
    groupId: "",
    shared: false,
    shareCount: 2,
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
    await user.click(screen.getByLabelText("Category"))
    await user.click(await screen.findByRole("option", { name: "— Add new —" }))
    await user.type(await screen.findByLabelText("Category custom value"), "Dining")
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

describe("TransactionForm smart defaults", () => {
  const stored = {
    accountName: "Sample Checking",
    accountType: "Checking",
    category: "Groceries",
    transactionType: "Debit",
  }

  const existing: Transaction = {
    id: "txn-existing",
    date: "2026-07-20",
    description: "Corner Bakery",
    amountMinor: -950,
    category: "Dining",
    transactionType: "Credit",
    accountName: "Sample Card",
    accountType: "Credit",
    provider: null,
    labels: [],
    notes: null,
    groupId: null,
    shared: false,
    shareCount: 2,
    importBatchId: "manual",
    fingerprint: "manual-txn-existing",
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
  }

  it("prefills account, category, and type from the last-created transaction", () => {
    saveTransactionFormDefaults(stored, window.localStorage)
    const onSubmit = vi
      .fn<(draft: TransactionDraft) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(<TransactionForm onSubmit={onSubmit} onCancel={vi.fn<() => void>()} />)

    expect(screen.getByLabelText("Category custom value")).toHaveValue("Groceries")
    expect(screen.getByLabelText("Transaction type custom value")).toHaveValue("Debit")
    expect(screen.getByLabelText("Account name custom value")).toHaveValue("Sample Checking")
    expect(screen.getByLabelText("Account type custom value")).toHaveValue("Checking")
  })

  it("shows the stored values as selected options when they match field options", () => {
    saveTransactionFormDefaults(stored, window.localStorage)
    const onSubmit = vi
      .fn<(draft: TransactionDraft) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(
      <TransactionForm
        onSubmit={onSubmit}
        onCancel={vi.fn<() => void>()}
        fieldOptions={{
          category: ["Groceries"],
          transactionType: ["Debit"],
          accountName: ["Sample Checking"],
          accountType: ["Checking"],
        }}
      />,
    )

    expect(screen.getByLabelText("Category")).toHaveTextContent("Groceries")
    expect(screen.getByLabelText("Transaction type")).toHaveTextContent("Debit")
    expect(screen.getByLabelText("Account name")).toHaveTextContent("Sample Checking")
    expect(screen.getByLabelText("Account type")).toHaveTextContent("Checking")
  })

  it("never overwrites explicit user edits and remembers them for next time", async () => {
    const user = userEvent.setup()
    saveTransactionFormDefaults(stored, window.localStorage)
    const onSubmit = vi
      .fn<(draft: TransactionDraft) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(<TransactionForm onSubmit={onSubmit} onCancel={vi.fn<() => void>()} />)

    const categoryInput = screen.getByLabelText("Category custom value")
    await user.clear(categoryInput)
    await user.type(categoryInput, "Dining")
    // Interacting with other fields must not restore the stored default.
    await user.type(screen.getByLabelText("Description"), "Lunch")
    await user.type(screen.getByLabelText("Date"), "2026-07-22")
    await user.type(screen.getByLabelText("Amount"), "-18.50")
    expect(screen.getByLabelText("Category custom value")).toHaveValue("Dining")

    await user.click(screen.getByRole("button", { name: "Add transaction" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: "Dining" }))
    expect(window.localStorage.getItem("budgetlens.transaction-form-defaults.v1")).toContain(
      '"category":"Dining"',
    )
  })

  it("leaves edit mode untouched by stored defaults", async () => {
    const user = userEvent.setup()
    saveTransactionFormDefaults(stored, window.localStorage)
    const onSubmit = vi
      .fn<(draft: TransactionDraft) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(
      <TransactionForm transaction={existing} onSubmit={onSubmit} onCancel={vi.fn<() => void>()} />,
    )

    expect(screen.getByLabelText("Category custom value")).toHaveValue("Dining")
    expect(screen.getByLabelText("Account name custom value")).toHaveValue("Sample Card")

    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: "Dining" }))
    // Saving an edit must not rewrite the create-form defaults.
    expect(window.localStorage.getItem("budgetlens.transaction-form-defaults.v1")).toContain(
      '"category":"Groceries"',
    )
  })
})
