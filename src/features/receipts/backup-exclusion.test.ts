// Documents the backup contract for receipt photos: images live outside the
// Dexie finance tables, so createBackup output must never contain image data.
// (Keeping bytes out of backups is what keeps backup files small.)

import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"
import { addReceiptForTransaction, listTransactionReceipts } from "@/features/receipts/receipts"
import { syntheticPngBytes } from "@/features/receipts/synthetic-image"
import { createBackup } from "@/features/settings/backup"

const IMAGE_MARKER = "RECEIPT-IMAGE-MARKER-7f3a9c1e"

function markedImageFile(): File {
  const png = syntheticPngBytes()
  const marker = new TextEncoder().encode(IMAGE_MARKER)
  const combined = new Uint8Array(png.length + marker.length)
  combined.set(png, 0)
  combined.set(marker, png.length)
  return new File([combined.buffer], "receipt.png", { type: "image/png" })
}

describe("receipt backup exclusion", () => {
  it("keeps image bytes and references out of JSON backups", async () => {
    const db = new BudgetLensDatabase(`budgetlens-receipts-backup-${crypto.randomUUID()}`)
    try {
      const target = createRepositories(db)
      const transaction = await target.transactions.add({
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
      const ref = await addReceiptForTransaction(transaction.id, markedImageFile())
      expect(listTransactionReceipts(transaction.id)).toHaveLength(1)

      const backup = await createBackup(target, "2026-08-15T12:00:00.000Z")
      const serialized = JSON.stringify(backup)

      // The stored image bytes carry a unique marker; none of it may leak in.
      expect(serialized).not.toContain(IMAGE_MARKER)
      expect(serialized).not.toContain(ref.hash)
      // No receipt-specific keys ride along either.
      expect(serialized.toLowerCase()).not.toContain("receipt")
      expect(Object.keys(backup)).not.toContain("receipts")
      expect(Object.keys(backup)).toEqual([
        "format",
        "version",
        "exportedAt",
        "transactions",
        "wealth",
        "wealthBreakdown",
        "wealthAccounts",
        "budgets",
        "imports",
        "transactionGroups",
      ])
      expect(backup.transactions).toHaveLength(1)
    } finally {
      await db.delete()
    }
  })
})
