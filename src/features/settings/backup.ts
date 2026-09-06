import { z } from "zod"

import type { BudgetLensDatabase } from "@/db/database"
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

const nullableString = z.string().nullable()

const backupTransactionSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  description: z.string(),
  amountMinor: z.number().int(),
  category: nullableString,
  transactionType: nullableString,
  accountName: nullableString,
  accountType: nullableString,
  provider: nullableString,
  labels: z.array(z.string()),
  notes: nullableString,
  groupId: nullableString,
  shared: z.boolean(),
  shareCount: z.number().int(),
  importBatchId: z.string().min(1),
  fingerprint: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

const backupWealthSchema = z.object({
  id: z.string().min(1),
  series: z.enum(["netWorth", "investment"]),
  date: z.string().min(1),
  valueMinor: z.number().int(),
  importBatchId: z.string().min(1),
  fingerprint: z.string().min(1),
  createdAt: z.string().min(1),
})

const backupWealthBreakdownSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  section: z.enum(["assets", "debts"]),
  segment: z.enum(["cash", "investments", "property", "creditCards", "loans"]),
  valueMinor: z.number().int(),
  descriptor: nullableString,
  importBatchId: z.string().min(1),
  fingerprint: z.string().min(1),
  createdAt: z.string().min(1),
})

const backupWealthAccountSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  accountType: z.enum(["cash", "investments", "property"]),
  sourceLabel: z.string().min(1),
  valueMinor: z.number().int(),
  descriptor: nullableString,
  importBatchId: z.string().min(1),
  fingerprint: z.string().min(1),
  createdAt: z.string().min(1),
})

const backupImportBatchSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "transactions",
    "bundle",
    "wealthBreakdown",
    "wealthAccounts",
    "netWorth",
    "investment",
  ]),
  sourceName: z.string(),
  sourceHash: z.string().min(1),
  rowCount: z.number().int(),
  importedCount: z.number().int(),
  skippedCount: z.number().int(),
  replacedCount: z.number().int(),
  importedAt: z.string().min(1),
})

const backupBudgetSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  amountMinor: z.number().int(),
  period: z.enum(["monthly", "yearly"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

const backupTransactionGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: nullableString,
  color: z.enum(["violet", "blue", "emerald", "amber", "rose", "cyan", "orange", "pink"]),
  startDate: nullableString,
  endDate: nullableString,
  budgetMinor: z.number().int().nullable(),
  archived: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

const backupFileSchema = z.object({
  format: z.literal("budgetlens-backup"),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().optional(),
  transactions: z.array(backupTransactionSchema),
  wealth: z.array(backupWealthSchema),
  wealthBreakdown: z.array(backupWealthBreakdownSchema),
  wealthAccounts: z.array(backupWealthAccountSchema),
  budgets: z.array(backupBudgetSchema),
  imports: z.array(backupImportBatchSchema),
  transactionGroups: z.array(backupTransactionGroupSchema),
})

export interface RestoreReceipt {
  transactions: number
  wealth: number
  wealthBreakdown: number
  wealthAccounts: number
  budgets: number
  imports: number
  transactionGroups: number
}

export interface BackupPreview {
  exportedAt: string | undefined
  counts: RestoreReceipt
}

function invalidBackupError(detail?: string): Error {
  const hint =
    'Invalid BudgetLens backup: expected format "budgetlens-backup" ' +
    `version ${BACKUP_VERSION}. Version-1 bundles restore through Imports.`
  return new Error(detail ? `${hint} ${detail}` : hint)
}

function parseBackupFile(backup: unknown) {
  const parsed = backupFileSchema.safeParse(backup)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw invalidBackupError(
      first ? `(${first.path.join(".") || "root"}: ${first.message})` : undefined,
    )
  }
  return parsed.data
}

/**
 * Validate a v3 backup without writing anything. Used for the pre-restore
 * summary so the user sees what a file holds before confirming.
 */
export function previewBackup(backup: unknown): BackupPreview {
  const data = parseBackupFile(backup)
  return {
    exportedAt: data.exportedAt,
    counts: {
      transactions: data.transactions.length,
      wealth: data.wealth.length,
      wealthBreakdown: data.wealthBreakdown.length,
      wealthAccounts: data.wealthAccounts.length,
      budgets: data.budgets.length,
      imports: data.imports.length,
      transactionGroups: data.transactionGroups.length,
    },
  }
}

/**
 * Exact snapshot restore for v3 backups written by createBackup.
 *
 * Semantics are replace, not merge: every finance table is cleared inside one
 * Dexie transaction and the validated rows are written back with their
 * original ids, so group membership and import-batch links survive intact.
 * Repeating the same restore is idempotent (bulkPut upserts by id).
 * Version-1 bundles keep flowing through the Imports pipeline, not here.
 */
export async function restoreBackup(
  db: BudgetLensDatabase,
  backup: unknown,
): Promise<RestoreReceipt> {
  const data = parseBackupFile(backup)

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
      await Promise.all([
        db.transactions.clear(),
        db.wealth.clear(),
        db.wealthBreakdown.clear(),
        db.wealthAccounts.clear(),
        db.budgets.clear(),
        db.imports.clear(),
        db.transactionGroups.clear(),
      ])
      await Promise.all([
        db.transactions.bulkPut(data.transactions),
        db.wealth.bulkPut(data.wealth),
        db.wealthBreakdown.bulkPut(data.wealthBreakdown),
        db.wealthAccounts.bulkPut(data.wealthAccounts),
        db.budgets.bulkPut(data.budgets),
        db.imports.bulkPut(data.imports),
        db.transactionGroups.bulkPut(data.transactionGroups),
      ])
    },
  )

  return {
    transactions: data.transactions.length,
    wealth: data.wealth.length,
    wealthBreakdown: data.wealthBreakdown.length,
    wealthAccounts: data.wealthAccounts.length,
    budgets: data.budgets.length,
    imports: data.imports.length,
    transactionGroups: data.transactionGroups.length,
  }
}
