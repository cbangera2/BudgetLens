import type { BudgetLensRepositories } from "@/domain/repositories"

export const BACKUP_VERSION = 3

export async function createBackup(
  repositories: BudgetLensRepositories,
  exportedAt = new Date().toISOString(),
) {
  const [
    transactions,
    wealth,
    wealthBreakdown,
    wealthAccounts,
    budgets,
    imports,
    transactionGroups,
  ] = await Promise.all([
    repositories.transactions.list(),
    repositories.wealth.list(),
    repositories.wealthBreakdown.list(),
    repositories.wealthAccounts.list(),
    repositories.budgets.list(),
    repositories.imports.list(),
    repositories.transactionGroups.list({ includeArchived: true }),
  ])

  return {
    format: "budgetlens-backup",
    version: BACKUP_VERSION,
    exportedAt,
    transactions,
    wealth,
    wealthBreakdown,
    wealthAccounts,
    budgets,
    imports,
    transactionGroups,
  } as const
}

export async function clearAllData(repositories: BudgetLensRepositories) {
  await Promise.all([
    repositories.transactions.clear(),
    repositories.wealth.clear(),
    repositories.wealthBreakdown.clear(),
    repositories.wealthAccounts.clear(),
    repositories.budgets.clear(),
    repositories.imports.clear(),
    repositories.transactionGroups.clear(),
  ])
}
