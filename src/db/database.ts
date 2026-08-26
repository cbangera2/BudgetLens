import Dexie, { type EntityTable } from "dexie"

import type {
  BudgetGoal,
  ImportBatch,
  Transaction,
  TransactionGroup,
  WealthAccountSnapshot,
  WealthBreakdownSnapshot,
  WealthSnapshot,
} from "@/domain/models"

export const DATABASE_NAME = "budgetlens"
export const DATABASE_SCHEMA_VERSION = 3

export class BudgetLensDatabase extends Dexie {
  transactions!: EntityTable<Transaction, "id">
  wealth!: EntityTable<WealthSnapshot, "id">
  wealthBreakdown!: EntityTable<WealthBreakdownSnapshot, "id">
  wealthAccounts!: EntityTable<WealthAccountSnapshot, "id">
  imports!: EntityTable<ImportBatch, "id">
  budgets!: EntityTable<BudgetGoal, "id">
  transactionGroups!: EntityTable<TransactionGroup, "id">

  constructor(name = DATABASE_NAME) {
    super(name)

    this.version(DATABASE_SCHEMA_VERSION).stores({
      transactions:
        "&id, date, fingerprint, importBatchId, category, transactionType, accountName, updatedAt, groupId",
      wealth: "&id, &[series+date], series, date, fingerprint, importBatchId, createdAt",
      wealthBreakdown:
        "&id, &[segment+date], segment, section, date, fingerprint, importBatchId, createdAt",
      wealthAccounts:
        "&id, &[accountType+sourceLabel+date], accountType, sourceLabel, date, fingerprint, importBatchId, createdAt",
      imports: "&id, sourceHash, importedAt, kind",
      budgets: "&id, category, period, updatedAt",
      transactionGroups: "&id, name, archived",
    })
  }
}

export const database = new BudgetLensDatabase()
