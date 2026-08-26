import type { BudgetLensRepositories } from "@/domain/repositories"
import { createBackup } from "@/features/settings/backup"
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
        put: async (group) => group as never,
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
