import type { ImportBatch, Transaction, TransactionGroup, WealthSnapshot } from "@/domain/models"

export function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "transaction-1",
    date: "2026-01-15",
    description: "Neighborhood Market",
    amountMinor: -4250,
    category: "Groceries",
    transactionType: "Debit",
    accountName: "Daily Checking",
    accountType: "Checking",
    provider: "Example Credit Union",
    labels: [],
    notes: null,
    groupId: null,
    shared: false,
    shareCount: 2,
    importBatchId: "batch-1",
    fingerprint: "transaction-fingerprint-1",
    createdAt: "2026-01-16T12:00:00.000Z",
    updatedAt: "2026-01-16T12:00:00.000Z",
    ...overrides,
  }
}

export function buildTransactionGroup(overrides: Partial<TransactionGroup> = {}): TransactionGroup {
  return {
    id: "group-1",
    name: "Vacation 2026",
    description: null,
    color: "violet",
    startDate: null,
    endDate: null,
    budgetMinor: null,
    archived: false,
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  }
}

export function buildWealthSnapshot(overrides: Partial<WealthSnapshot> = {}): WealthSnapshot {
  return {
    id: "wealth-1",
    series: "netWorth",
    date: "2026-01-31",
    valueMinor: 12_345_67,
    importBatchId: "batch-2",
    fingerprint: "wealth-fingerprint-1",
    createdAt: "2026-02-01T12:00:00.000Z",
    ...overrides,
  }
}

export function buildImportBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: "batch-1",
    kind: "transactions",
    sourceName: "synthetic-transactions.csv",
    sourceHash: "synthetic-hash",
    rowCount: 1,
    importedCount: 1,
    skippedCount: 0,
    replacedCount: 0,
    importedAt: "2026-01-16T12:00:00.000Z",
    ...overrides,
  }
}
