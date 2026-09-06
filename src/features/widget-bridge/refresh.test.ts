import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"
import type { TransactionDraft } from "@/domain/models"
import type { BudgetLensRepositories } from "@/domain/repositories"
import { buildFinanceSnapshot } from "@/features/assistant/data-tools"
import { ImportService } from "@/features/imports/import-service"
import { createBackup, restoreBackup } from "@/features/settings/backup"
import {
  cancelScheduledWidgetRefresh,
  notifyBudgetsChanged,
  notifyImportCommitted,
  notifyRestoreCompleted,
  notifyTransactionsChanged,
  refreshWidgetSnapshot,
  scheduleWidgetRefresh,
} from "@/features/widget-bridge/refresh"
import {
  validateWidgetSnapshot,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
} from "@/features/widget-bridge/snapshot"
import {
  WIDGET_SNAPSHOT_STORAGE_KEY,
  readStagedWidgetSnapshot,
  writeWidgetSnapshot,
} from "@/lib/native"

const NOW = new Date("2026-09-06T12:00:00.000Z")

function draft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    date: "2026-09-01",
    description: "Synthetic Market",
    amountMinor: -4250,
    category: "Groceries",
    transactionType: "Debit",
    accountName: "Sample Checking",
    accountType: "Checking",
    provider: "Example Credit Union",
    labels: [],
    notes: null,
    ...overrides,
  }
}

async function latestSnapshot() {
  const raw = await readStagedWidgetSnapshot()
  if (raw === null) throw new Error("expected a staged widget snapshot")
  const result = validateWidgetSnapshot(JSON.parse(raw) as unknown)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("widget snapshot failed validation")
  return result.snapshot
}

describe("widget refresh triggers", () => {
  let db: BudgetLensDatabase
  let repositories: BudgetLensRepositories

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-widget-test-${crypto.randomUUID()}`)
    repositories = createRepositories(db)
  })

  afterEach(async () => {
    cancelScheduledWidgetRefresh()
    await db.delete()
  })

  it("writes a versioned snapshot for a manual transaction add", async () => {
    await repositories.transactions.add(draft())

    const result = await notifyTransactionsChanged(repositories, NOW)

    expect(result).toMatchObject({ ok: true, via: "local-storage" })
    const snapshot = await latestSnapshot()
    expect(snapshot.version).toBe(WIDGET_SNAPSHOT_SCHEMA_VERSION)
    expect(snapshot.transactionCount).toBe(1)
    expect(snapshot.topCategories.map((entry) => entry.category)).toContain("Groceries")
  })

  it("reflects transaction edits and deletes", async () => {
    const created = await repositories.transactions.add(draft())
    await repositories.transactions.update(created.id, { category: "Dining" })

    await notifyTransactionsChanged(repositories, NOW)
    expect((await latestSnapshot()).topCategories.map((entry) => entry.category)).toContain(
      "Dining",
    )

    await repositories.transactions.remove(created.id)
    await notifyTransactionsChanged(repositories, NOW)
    const after = await latestSnapshot()
    expect(after.transactionCount).toBe(0)
    expect(after.topCategories).toEqual([])
  })

  it("reflects budget saves and deletes in the month summary", async () => {
    await repositories.transactions.add(draft({ date: "2026-09-02" }))
    await repositories.budgets.put({
      id: "budget-groceries",
      category: "Groceries",
      amountMinor: 50000,
      period: "monthly",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    })

    await notifyBudgetsChanged(repositories, NOW)
    const saved = await latestSnapshot()
    expect(saved.month).toMatchObject({ budgetMinor: 50000, spentMinor: 4250 })
    expect(saved.budgets.map((entry) => entry.category)).toContain("Groceries")

    await repositories.budgets.remove("budget-groceries")
    await notifyBudgetsChanged(repositories, NOW)
    const cleared = await latestSnapshot()
    expect(cleared.month.budgetMinor).toBe(0)
    expect(cleared.budgets).toEqual([])
  })

  it("fires on the import-commit path with committed rows visible", async () => {
    const service = new ImportService(db)
    const preview = await service.preview(
      "Date,Description,Amount,Account Name\n2026-09-03,Synthetic Cafe,-12.34,Sample Checking",
      "synthetic.csv",
    )
    await service.commit(preview)

    const result = await notifyImportCommitted(repositories, NOW)

    expect(result.ok).toBe(true)
    const snapshot = await latestSnapshot()
    expect(snapshot.transactionCount).toBe(1)
    expect(snapshot.month.spentMinor).toBe(0) // no budgets yet: spend tracked, budget zero
  })

  it("fires on the restore path and reflects restored rows", async () => {
    await repositories.transactions.add(draft({ description: "Pre-restore row" }))
    const backup = await createBackup(repositories, "2026-09-05T12:00:00.000Z")

    const fresh = new BudgetLensDatabase(`budgetlens-widget-restore-${crypto.randomUUID()}`)
    try {
      await restoreBackup(fresh, JSON.parse(JSON.stringify(backup)))
      const restored = createRepositories(fresh)

      const result = await notifyRestoreCompleted(restored, NOW)

      expect(result.ok).toBe(true)
      const snapshot = await latestSnapshot()
      expect(snapshot.transactionCount).toBe(1)
      expect(snapshot.topCategories.map((entry) => entry.category)).toContain("Groceries")
    } finally {
      await fresh.delete()
    }
  })

  it("never throws when the build or sink fails", async () => {
    const failing = createRepositories(db)

    await expect(
      refreshWidgetSnapshot(repositories, NOW, {
        buildSnapshot: async () => {
          throw new Error("synthetic build failure")
        },
      }),
    ).resolves.toMatchObject({ ok: false, via: "noop", reason: "synthetic build failure" })

    await expect(
      refreshWidgetSnapshot(failing, NOW, {
        sink: async () => {
          throw new Error("synthetic sink failure")
        },
      }),
    ).resolves.toMatchObject({ ok: false, via: "noop" })
  })

  it("coalesces burst schedules into a single build + write", async () => {
    let builds = 0
    let writes: string[] = []
    const hooks = {
      buildSnapshot: async (repos: BudgetLensRepositories) => {
        builds += 1
        return buildFinanceSnapshot(repos)
      },
      sink: async (json: string) => {
        writes.push(json)
        return writeWidgetSnapshot(json)
      },
    }

    await repositories.transactions.add(draft())
    const first = scheduleWidgetRefresh(repositories, { delayMs: 10, now: NOW, hooks })
    const second = scheduleWidgetRefresh(repositories, { delayMs: 10, now: NOW, hooks })
    const third = scheduleWidgetRefresh(repositories, { delayMs: 10, now: NOW, hooks })

    const [one, two, three] = await Promise.all([first, second, third])
    expect(one.ok).toBe(true)
    expect(two).toEqual(one)
    expect(three).toEqual(one)
    expect(builds).toBe(1)
    expect(writes).toHaveLength(1)
    expect(window.localStorage.getItem(WIDGET_SNAPSHOT_STORAGE_KEY)).toBe(writes[0])
  })
})
