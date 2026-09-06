import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { repositories } from "@/db/repositories"
import { ReceiptSection } from "@/features/receipts/receipt-section"
import { listTransactionReceipts } from "@/features/receipts/receipts"
import { syntheticImageFile } from "@/features/receipts/synthetic-image"

async function existingTransactionId(): Promise<string> {
  // Receipts attach to real transactions, so the orphan prune that runs on
  // mount keeps them.
  const transaction = await repositories.transactions.add({
    date: "2026-08-15",
    description: "Synthetic Market",
    amountMinor: -2500,
    category: "Groceries",
    transactionType: "Debit",
    accountName: "Sample Checking",
    accountType: "Checking",
    provider: "Sample Bank",
    labels: [],
    notes: null,
  })
  return transaction.id
}

describe("ReceiptSection", () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await repositories.transactions.clear()
  })

  it("explains backup exclusion and attaches a photo via file input", async () => {
    const user = userEvent.setup()
    const transactionId = await existingTransactionId()
    render(<ReceiptSection transactionId={transactionId} />)

    expect(screen.getByRole("heading", { name: "Receipt photos" })).toBeVisible()
    expect(screen.getByText(/excluded from JSON backups/)).toBeVisible()

    const input = screen.getByLabelText("Add receipt photo")
    expect(input).toHaveAttribute("accept", "image/*")
    await user.upload(input, syntheticImageFile("section-a"))

    expect(await screen.findByRole("button", { name: "Remove receipt photo 1" })).toBeVisible()
    expect(listTransactionReceipts(transactionId)).toHaveLength(1)
  })

  it("removes an attached photo", async () => {
    const user = userEvent.setup()
    const transactionId = await existingTransactionId()
    render(<ReceiptSection transactionId={transactionId} />)

    await user.upload(screen.getByLabelText("Add receipt photo"), syntheticImageFile("section-b"))
    const removeButton = await screen.findByRole("button", { name: "Remove receipt photo 1" })
    await user.click(removeButton)

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Remove receipt photo 1" }),
      ).not.toBeInTheDocument()
    })
    expect(listTransactionReceipts(transactionId)).toHaveLength(0)
  })
})
