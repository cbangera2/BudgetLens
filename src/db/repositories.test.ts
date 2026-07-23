import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"

describe("Dexie repositories", () => {
  let db: BudgetLensDatabase

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-repositories-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await db.delete()
  })

  it("supports transaction CRUD and filters", async () => {
    const repositories = createRepositories(db)
    const first = await repositories.transactions.add({
      date: "2026-01-01",
      description: "Synthetic Market",
      amountMinor: -2500,
      category: "Groceries",
      transactionType: "Debit",
      accountName: "Sample Checking",
      accountType: "Checking",
      provider: "Sample Bank",
      labels: ["weekly"],
      notes: null,
    })
    await repositories.transactions.add({
      date: "2026-02-01",
      description: "Synthetic Payroll",
      amountMinor: 100_000,
      category: "Income",
      transactionType: "Credit",
      accountName: "Sample Checking",
      accountType: "Checking",
      provider: "Sample Bank",
      labels: [],
      notes: null,
    })

    expect(await repositories.transactions.list({ categories: ["Groceries"] })).toHaveLength(1)
    expect(await repositories.transactions.list({ search: "weekly" })).toHaveLength(1)
    expect(await repositories.transactions.list({ startDate: "2026-02-01" })).toHaveLength(1)

    const updated = await repositories.transactions.update(first.id, {
      description: "Edited Market",
    })
    expect(updated.description).toBe("Edited Market")
    await repositories.transactions.remove(first.id)
    expect(await repositories.transactions.list()).toHaveLength(1)
  })

  it("filters and sorts wealth snapshots", async () => {
    const repositories = createRepositories(db)
    await db.wealth.bulkAdd([
      {
        id: "two",
        series: "investment",
        date: "2026-02-01",
        valueMinor: 200,
        importBatchId: "batch",
        fingerprint: "two",
        createdAt: "2026-02-02T00:00:00.000Z",
      },
      {
        id: "one",
        series: "netWorth",
        date: "2026-01-01",
        valueMinor: 100,
        importBatchId: "batch",
        fingerprint: "one",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ])

    const rows = await repositories.wealth.list({ series: ["netWorth"] })
    expect(rows.map((row) => row.id)).toEqual(["one"])
  })
})
