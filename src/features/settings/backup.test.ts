import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"
import type { BudgetGoal, WealthAccountSnapshot, WealthBreakdownSnapshot } from "@/domain/models"
import type { BudgetLensRepositories } from "@/domain/repositories"
import {
  clearAllData,
  createBackup,
  previewBackup,
  restoreBackup,
} from "@/features/settings/backup"
import {
  buildImportBatch,
  buildTransaction,
  buildTransactionGroup,
  buildWealthSnapshot,
} from "@/test/factories"

describe("BudgetLens backups", () => {
  it("creates a versioned backup without an embedded raw source file", async () => {
    const repositories: BudgetLensRepositories = {
      transactions: {
        list: async () => [buildTransaction()],
        get: async () => buildTransaction(),
        add: async () => buildTransaction(),
        update: async () => buildTransaction(),
        updateMany: async () => undefined,
        remove: async () => undefined,
        clear: async () => undefined,
      },
      wealth: { list: async () => [buildWealthSnapshot()], clear: async () => undefined },
      wealthBreakdown: { list: async () => [], clear: async () => undefined },
      wealthAccounts: { list: async () => [], clear: async () => undefined },
      budgets: {
        list: async () => [],
        put: async (goal) => goal,
        remove: async () => undefined,
        clear: async () => undefined,
      },
      imports: { list: async () => [buildImportBatch()], clear: async () => undefined },
      transactionGroups: {
        list: async () => [buildTransactionGroup()],
        get: async () => buildTransactionGroup(),
        put: async (input) => ({
          id: input.id ?? "group-1",
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? "violet",
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          budgetMinor: input.budgetMinor ?? null,
          archived: input.archived ?? false,
          createdAt: "2026-01-01T12:00:00.000Z",
          updatedAt: "2026-01-01T12:00:00.000Z",
        }),
        remove: async () => undefined,
        members: async () => [],
        clear: async () => undefined,
      },
    }

    const backup = await createBackup(repositories, "2026-07-22T12:00:00.000Z")

    expect(backup.format).toBe("budgetlens-backup")
    expect(backup.version).toBe(3)
    expect(backup.transactions).toHaveLength(1)
    expect(backup.wealth).toHaveLength(1)
    expect(backup.transactionGroups).toHaveLength(1)
    expect(JSON.stringify(backup)).not.toContain("rawContent")
  })
})

const SNAPSHOT_AT = "2026-07-29T12:00:00.000Z"

function buildBreakdown(): WealthBreakdownSnapshot {
  return {
    id: "breakdown-1",
    date: "2026-07-29",
    section: "assets",
    segment: "cash",
    valueMinor: 120050,
    descriptor: "2 accounts",
    importBatchId: "batch-1",
    fingerprint: "fingerprint-breakdown-1",
    createdAt: SNAPSHOT_AT,
  }
}

function buildAccount(): WealthAccountSnapshot {
  return {
    id: "account-1",
    date: "2026-07-29",
    accountType: "investments",
    sourceLabel: "Synthetic Brokerage",
    valueMinor: 800000,
    descriptor: "Connected",
    importBatchId: "batch-1",
    fingerprint: "fingerprint-account-1",
    createdAt: SNAPSHOT_AT,
  }
}

function buildBudget(): BudgetGoal {
  return {
    id: "budget-1",
    category: "Groceries",
    amountMinor: 50000,
    period: "monthly",
    createdAt: SNAPSHOT_AT,
    updatedAt: SNAPSHOT_AT,
  }
}

function byId<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].toSorted((left, right) => left.id.localeCompare(right.id))
}

type BackupFile = Awaited<ReturnType<typeof createBackup>>

function comparableTables(backup: BackupFile) {
  return {
    transactions: byId(backup.transactions),
    wealth: byId(backup.wealth),
    wealthBreakdown: byId(backup.wealthBreakdown),
    wealthAccounts: byId(backup.wealthAccounts),
    budgets: byId(backup.budgets),
    imports: byId(backup.imports),
    transactionGroups: byId(backup.transactionGroups),
  }
}

describe("BudgetLens backup restore", () => {
  let db: BudgetLensDatabase

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-restore-test-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await db.delete()
  })

  async function seedFullDatabase(): Promise<void> {
    const group = buildTransactionGroup({ id: "group-1" })
    const batch = buildImportBatch({ id: "batch-1" })
    await db.transaction(
      "rw",
      [
        db.transactions,
        db.wealth,
        db.wealthBreakdown,
        db.wealthAccounts,
        db.budgets,
        db.imports,
        db.transactionGroups,
      ],
      async () => {
        await db.transactionGroups.put(group)
        await db.imports.put(batch)
        await db.transactions.bulkPut([
          buildTransaction({ id: "txn-1", groupId: group.id, importBatchId: batch.id }),
          buildTransaction({ id: "txn-2", importBatchId: batch.id }),
        ])
        await db.wealth.bulkPut([buildWealthSnapshot({ id: "wealth-1", importBatchId: batch.id })])
        await db.wealthBreakdown.bulkPut([buildBreakdown()])
        await db.wealthAccounts.bulkPut([buildAccount()])
        await db.budgets.put(buildBudget())
      },
    )
  }

  it("round-trips a full database with ids and links preserved", async () => {
    await seedFullDatabase()
    const repositories = createRepositories(db)
    const backup = await createBackup(repositories, "2026-07-29T12:00:00.000Z")

    await clearAllData(repositories)
    expect(await db.transactions.count()).toBe(0)

    const receipt = await restoreBackup(db, JSON.parse(JSON.stringify(backup)))

    expect(receipt).toEqual({
      transactions: 2,
      wealth: 1,
      wealthBreakdown: 1,
      wealthAccounts: 1,
      budgets: 1,
      imports: 1,
      transactionGroups: 1,
    })

    // Group membership and import-batch links survive via preserved ids.
    const members = await createRepositories(db).transactionGroups.members("group-1")
    expect(members.map((member) => member.id)).toEqual(["txn-1"])
    expect(await db.transactions.get("txn-2")).toMatchObject({ importBatchId: "batch-1" })

    const after = await createBackup(createRepositories(db), "2026-07-30T12:00:00.000Z")
    expect(comparableTables(after)).toEqual(comparableTables(backup))
  })

  it("is idempotent when the same backup is restored twice", async () => {
    await seedFullDatabase()
    const backup = await createBackup(createRepositories(db), "2026-07-29T12:00:00.000Z")
    const payload = JSON.parse(JSON.stringify(backup))

    await restoreBackup(db, payload)
    const receipt = await restoreBackup(db, payload)

    expect(receipt.transactions).toBe(2)
    expect(await db.transactions.count()).toBe(2)
    expect(await db.imports.count()).toBe(1)
  })

  it("previews counts without writing anything", async () => {
    await seedFullDatabase()
    const backup = await createBackup(createRepositories(db), "2026-07-29T12:00:00.000Z")

    const preview = previewBackup(JSON.parse(JSON.stringify(backup)))

    expect(preview.exportedAt).toBe("2026-07-29T12:00:00.000Z")
    expect(preview.counts).toEqual({
      transactions: 2,
      wealth: 1,
      wealthBreakdown: 1,
      wealthAccounts: 1,
      budgets: 1,
      imports: 1,
      transactionGroups: 1,
    })
    expect(await db.transactions.count()).toBe(2)
  })

  it("rejects version-1 bundles with a pointer to Imports", async () => {
    await expect(
      restoreBackup(db, {
        format: "budgetlens",
        version: 1,
        transactions: [],
        netWorthHistory: [],
        investmentHistory: [],
        netWorthBreakdown: [],
        wealthAccounts: [],
      }),
    ).rejects.toThrow(/Imports/)
  })

  it("rejects corrupt payloads without touching stored data", async () => {
    await seedFullDatabase()

    const corruptPayloads = [
      null,
      { format: "budgetlens-backup", version: 2 },
      {
        format: "budgetlens-backup",
        version: 3,
        transactions: [{ id: "txn-1" }],
        wealth: [],
        wealthBreakdown: [],
        wealthAccounts: [],
        budgets: [],
        imports: [],
        transactionGroups: [],
      },
      {
        format: "budgetlens-backup",
        version: 3,
        transactions: [{ ...buildTransaction({ id: "txn-bad" }), amountMinor: -4250.7 }],
        wealth: [],
        wealthBreakdown: [],
        wealthAccounts: [],
        budgets: [],
        imports: [],
        transactionGroups: [],
      },
    ]
    await Promise.all(
      corruptPayloads.map((corrupt) =>
        expect(restoreBackup(db, corrupt)).rejects.toThrow(/Invalid BudgetLens backup/),
      ),
    )

    expect(await db.transactions.count()).toBe(2)
    expect(await db.budgets.count()).toBe(1)
  })
})
