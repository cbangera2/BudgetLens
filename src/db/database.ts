import Dexie, { type EntityTable } from "dexie"

import type { BudgetGoal, ImportBatch, Transaction, WealthSnapshot } from "@/domain/models"

export const DATABASE_NAME = "budgetlens"
export const DATABASE_SCHEMA_VERSION = 1

export class BudgetLensDatabase extends Dexie {
  transactions!: EntityTable<Transaction, "id">
  wealth!: EntityTable<WealthSnapshot, "id">
  imports!: EntityTable<ImportBatch, "id">
  budgets!: EntityTable<BudgetGoal, "id">

  constructor(name = DATABASE_NAME) {
    super(name)

    this.version(DATABASE_SCHEMA_VERSION).stores({
      transactions:
        "&id, date, fingerprint, importBatchId, category, transactionType, accountName, updatedAt",
      wealth: "&id, &[series+date], series, date, fingerprint, importBatchId, createdAt",
      imports: "&id, sourceHash, importedAt, kind",
      budgets: "&id, category, period, updatedAt",
    })
  }
}

export const database = new BudgetLensDatabase()
