import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"
import type { Transaction } from "@/domain/models"
import {
  addReceiptForTransaction,
  deleteTransactionReceipts,
  installReceiptCascade,
  listTransactionReceipts,
  pruneOrphanedReceipts,
  removeTransactionReceipt,
} from "@/features/receipts/receipts"
import { loadReceiptBlob } from "@/features/receipts/storage"
import { syntheticImageFile, syntheticPngBytes } from "@/features/receipts/synthetic-image"

describe("receipt attach/list/remove pipeline", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("attaches, lists, and reloads identical bytes", async () => {
    const ref = await addReceiptForTransaction("tx-1", syntheticImageFile("attach-a"))

    expect(ref.hash).toMatch(/^[0-9a-f]{64}$/)
    // jsdom has no canvas pipeline, so the synthetic source is kept as-is.
    expect(ref.mimeType).toBe("image/png")
    expect(listTransactionReceipts("tx-1")).toHaveLength(1)

    const loaded = await loadReceiptBlob(ref.hash)
    if (!loaded) throw new Error("expected stored receipt bytes")
    // Spread to plain arrays: IndexedDB clones buffers across realms, where
    // typed-array deep equality is unreliable.
    expect([...new Uint8Array(await loaded.arrayBuffer())]).toEqual([
      ...syntheticPngBytes("attach-a"),
    ])
  })

  it("dedupes identical bytes and rejects non-images", async () => {
    const first = await addReceiptForTransaction("tx-1", syntheticImageFile("dedupe-a"))
    const second = await addReceiptForTransaction("tx-1", syntheticImageFile("dedupe-a"))

    expect(second.hash).toBe(first.hash)
    expect(listTransactionReceipts("tx-1")).toHaveLength(1)

    await expect(
      addReceiptForTransaction("tx-1", new Blob(["text"], { type: "text/plain" })),
    ).rejects.toThrow(/Only image files/)
    await expect(addReceiptForTransaction("", syntheticImageFile("dedupe-a"))).rejects.toThrow(
      /transaction id/,
    )
  })

  it("removes single receipts and garbage-collects unreferenced bytes", async () => {
    const ref = await addReceiptForTransaction("tx-1", syntheticImageFile("shared-a"))
    await addReceiptForTransaction("tx-2", syntheticImageFile("shared-a"))

    expect(await removeTransactionReceipt("tx-1", ref.hash)).toBe(true)
    expect(listTransactionReceipts("tx-1")).toHaveLength(0)
    // Shared bytes survive while tx-2 still references them.
    expect(await loadReceiptBlob(ref.hash)).not.toBeNull()

    expect(await removeTransactionReceipt("tx-2", ref.hash)).toBe(true)
    expect(await loadReceiptBlob(ref.hash)).toBeNull()
    expect(await removeTransactionReceipt("tx-2", ref.hash)).toBe(false)
  })

  it("delete-cascades every image for a transaction", async () => {
    const first = await addReceiptForTransaction("tx-1", syntheticImageFile("cascade-a"))
    const second = await addReceiptForTransaction("tx-1", syntheticImageFile("cascade-b"))

    expect(await deleteTransactionReceipts("tx-1")).toBe(2)
    expect(listTransactionReceipts("tx-1")).toHaveLength(0)
    expect(await loadReceiptBlob(first.hash)).toBeNull()
    expect(await loadReceiptBlob(second.hash)).toBeNull()
    expect(await deleteTransactionReceipts("tx-1")).toBe(0)
  })

  it("prunes receipts for transactions that no longer exist", async () => {
    const db = new BudgetLensDatabase(`budgetlens-receipts-prune-${crypto.randomUUID()}`)
    try {
      const target = createRepositories(db)
      const kept = await target.transactions.add({
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

      await addReceiptForTransaction(kept.id, syntheticImageFile("prune-kept"))
      await addReceiptForTransaction("ghost-tx", syntheticImageFile("prune-ghost"))

      expect(await pruneOrphanedReceipts(target)).toBe(1)
      expect(listTransactionReceipts(kept.id)).toHaveLength(1)
      expect(listTransactionReceipts("ghost-tx")).toHaveLength(0)
    } finally {
      await db.delete()
    }
  })

  it("cascades through the repository remove/clear wiring", async () => {
    const removed: string[] = []
    const cleared: string[] = []
    const target = {
      transactions: {
        list: async (): Promise<Transaction[]> => [],
        get: async (): Promise<Transaction | undefined> => undefined,
        add: async (): Promise<Transaction> => {
          throw new Error("unused")
        },
        update: async (): Promise<Transaction> => {
          throw new Error("unused")
        },
        updateMany: async (): Promise<void> => undefined,
        remove: async (id: string): Promise<void> => {
          removed.push(id)
        },
        clear: async (): Promise<void> => {
          cleared.push("cleared")
        },
      },
    }
    installReceiptCascade(target)
    installReceiptCascade(target)

    await addReceiptForTransaction("tx-9", syntheticImageFile("wiring-a"))
    await target.transactions.remove("tx-9")
    expect(removed).toEqual(["tx-9"])
    expect(listTransactionReceipts("tx-9")).toHaveLength(0)

    await addReceiptForTransaction("tx-10", syntheticImageFile("wiring-b"))
    await target.transactions.clear()
    expect(cleared).toEqual(["cleared"])
    expect(listTransactionReceipts("tx-10")).toHaveLength(0)
  })
})
