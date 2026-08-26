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

  it("assigns members to groups and preserves group fields across updates", async () => {
    const repositories = createRepositories(db)
    const group = await repositories.transactionGroups.put({ name: "Trip", color: "blue" })
    const transaction = await repositories.transactions.add({
      date: "2026-06-01",
      description: "Flight",
      amountMinor: -40_000,
      category: "Travel",
      transactionType: null,
      accountName: null,
      accountType: null,
      provider: null,
      labels: [],
      notes: null,
    })

    await repositories.transactions.update(transaction.id, {
      groupId: group.id,
      shared: true,
      shareCount: 3,
    })
    const stored = await repositories.transactions.get(transaction.id)
    expect(stored).toMatchObject({ groupId: group.id, shared: true, shareCount: 3 })

    const members = await repositories.transactionGroups.members(group.id)
    expect(members.map((member) => member.id)).toEqual([transaction.id])

    // Explicit clearing works (null vs undefined semantics).
    await repositories.transactions.update(transaction.id, { groupId: null })
    expect(await repositories.transactionGroups.members(group.id)).toHaveLength(0)
  })

  it("deleting a group keeps its transactions but unassigns them", async () => {
    const repositories = createRepositories(db)
    const group = await repositories.transactionGroups.put({ name: "Trip", color: "violet" })
    const transaction = await repositories.transactions.add({
      date: "2026-06-02",
      description: "Hotel",
      amountMinor: -50_000,
      category: "Lodging",
      transactionType: null,
      accountName: null,
      accountType: null,
      provider: null,
      labels: [],
      notes: null,
      groupId: group.id,
      shared: true,
      shareCount: 2,
    })

    await repositories.transactionGroups.remove(group.id)

    expect(await repositories.transactionGroups.get(group.id)).toBeUndefined()
    const survivor = await repositories.transactions.get(transaction.id)
    expect(survivor?.groupId).toBeNull()
    // Sharing decisions survive the group deletion.
    expect(survivor).toMatchObject({ shared: true, shareCount: 2 })
    expect(await repositories.transactions.list()).toHaveLength(1)
  })

  it("updateMany applies the same change to every selected transaction", async () => {
    const repositories = createRepositories(db)
    const first = await repositories.transactions.add({
      date: "2026-06-01",
      description: "A",
      amountMinor: -100,
      category: null,
      transactionType: null,
      accountName: null,
      accountType: null,
      provider: null,
      labels: [],
      notes: null,
    })
    const second = await repositories.transactions.add({
      date: "2026-06-02",
      description: "B",
      amountMinor: -200,
      category: null,
      transactionType: null,
      accountName: null,
      accountType: null,
      provider: null,
      labels: [],
      notes: null,
    })

    await repositories.transactions.updateMany([first.id, second.id], {
      shared: true,
      shareCount: 4,
    })

    for (const id of [first.id, second.id]) {
      expect((await repositories.transactions.get(id))?.shareCount).toBe(4)
    }
  })
})
