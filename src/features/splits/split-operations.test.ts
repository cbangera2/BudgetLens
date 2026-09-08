import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"

import { splitTransaction, unsplitTransaction } from "./split-operations"
import { getSplitChildren, onlyActiveTransactions } from "./splits"

async function seedParent() {
  const db = new BudgetLensDatabase(`budgetlens-splits-${crypto.randomUUID()}`)
  const repositories = createRepositories(db)
  const parent = await repositories.transactions.add({
    date: "2026-03-10",
    description: "Synthetic Split Market",
    amountMinor: -10_000,
    category: "Groceries",
    transactionType: "Debit",
    accountName: "Sample Checking",
    accountType: "Checking",
    provider: "Sample Bank",
    labels: ["weekly"],
    notes: "keep me",
  })
  return { db, repositories, parent }
}

describe("split/unsplit operations", () => {
  let db: BudgetLensDatabase | null = null

  afterEach(async () => {
    if (db) await db.delete()
    db = null
  })

  it("splits two ways with exact sums and a superseded parent", async () => {
    const seed = await seedParent()
    db = seed.db
    const { repositories, parent } = seed

    const { parent: marked, children } = await splitTransaction(repositories, parent.id, [
      { category: "Groceries", amountMinor: -6000 },
      { category: "Household", amountMinor: -4000 },
    ])

    expect(children).toHaveLength(2)
    expect(children.reduce((sum, child) => sum + child.amountMinor, 0)).toBe(parent.amountMinor)
    for (const child of children) {
      expect(child.date).toBe(parent.date)
      expect(child.description.startsWith(parent.description)).toBe(true)
    }
    expect(
      children.map((child) => child.category).toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
    ).toEqual(["Groceries", "Household"])
    // Parent row stays intact underneath: only labels changed.
    expect(marked.amountMinor).toBe(parent.amountMinor)
    expect(marked.description).toBe(parent.description)
    expect(marked.date).toBe(parent.date)
    expect(marked.category).toBe(parent.category)
    expect(marked.notes).toBe(parent.notes)

    const all = await repositories.transactions.list()
    expect(all).toHaveLength(3)
    expect(getSplitChildren(all, parent.id)).toHaveLength(2)
    // Aggregates exclude the superseded parent; children are ordinary rows.
    const active = onlyActiveTransactions(all)
    expect(active).toHaveLength(2)
    expect(active.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(parent.amountMinor)
  })

  it("restores the original single row on unsplit", async () => {
    const seed = await seedParent()
    db = seed.db
    const { repositories, parent } = seed

    await splitTransaction(repositories, parent.id, [
      { category: "Groceries", amountMinor: -3334 },
      { category: "Household", amountMinor: -3333 },
      { category: "Dining", amountMinor: -3333 },
    ])
    expect(await repositories.transactions.list()).toHaveLength(4)

    const restored = await unsplitTransaction(repositories, parent.id)
    expect(restored.amountMinor).toBe(parent.amountMinor)
    expect(restored.description).toBe(parent.description)
    expect(restored.date).toBe(parent.date)
    expect(restored.category).toBe(parent.category)
    expect(restored.labels).toEqual(parent.labels)
    expect(restored.notes).toBe(parent.notes)

    const all = await repositories.transactions.list()
    expect(all).toHaveLength(1)
    expect(onlyActiveTransactions(all)).toHaveLength(1)
  })

  it("rejects invalid splits and no-op unsplits", async () => {
    const seed = await seedParent()
    db = seed.db
    const { repositories, parent } = seed

    await expect(splitTransaction(repositories, parent.id, [])).rejects.toThrow(/at least two/)
    await expect(
      splitTransaction(repositories, parent.id, [
        { category: "A", amountMinor: -6000 },
        { category: "B", amountMinor: -3000 },
      ]),
    ).rejects.toThrow(/Parts total/)
    await expect(
      splitTransaction(repositories, parent.id, [
        { category: "A", amountMinor: 0 },
        { category: "B", amountMinor: -10_000 },
      ]),
    ).rejects.toThrow(/non-zero/)
    await expect(unsplitTransaction(repositories, parent.id)).rejects.toThrow(/not split/)
    await expect(splitTransaction(repositories, "missing-id", [])).rejects.toThrow(/not found/)
    await expect(unsplitTransaction(repositories, "missing-id")).rejects.toThrow(/not found/)
    // Failed splits leave no orphan children behind.
    expect(await repositories.transactions.list()).toHaveLength(1)
  })

  it("rejects splitting an already-split transaction", async () => {
    const seed = await seedParent()
    db = seed.db
    const { repositories, parent } = seed

    await splitTransaction(repositories, parent.id, [
      { category: "A", amountMinor: -5000 },
      { category: "B", amountMinor: -5000 },
    ])
    await expect(
      splitTransaction(repositories, parent.id, [
        { category: "A", amountMinor: -5000 },
        { category: "B", amountMinor: -5000 },
      ]),
    ).rejects.toThrow(/already split/)
  })
})
