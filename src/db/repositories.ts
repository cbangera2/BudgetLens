import { database, type BudgetLensDatabase } from "@/db/database"
import type {
  BudgetGoal,
  Transaction,
  TransactionDraft,
  TransactionFilters,
  WealthFilters,
  WealthSnapshot,
} from "@/domain/models"
import type { BudgetLensRepositories } from "@/domain/repositories"

function identifier(): string {
  return globalThis.crypto.randomUUID()
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const result = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function includes(value: string | null, choices: string[] | undefined): boolean {
  return !choices?.length || (value !== null && choices.includes(value))
}

function matchesTransaction(transaction: Transaction, filters: TransactionFilters): boolean {
  if (filters.startDate && transaction.date < filters.startDate) return false
  if (filters.endDate && transaction.date > filters.endDate) return false
  if (!includes(transaction.category, filters.categories)) return false
  if (!includes(transaction.description, filters.descriptions)) return false
  if (!includes(transaction.transactionType, filters.transactionTypes)) return false
  if (!includes(transaction.accountName, filters.accountNames)) return false

  const search = filters.search?.trim().toLocaleLowerCase()
  if (!search) return true

  return [
    transaction.description,
    transaction.category,
    transaction.transactionType,
    transaction.accountName,
    transaction.accountType,
    transaction.provider,
    transaction.notes,
    ...transaction.labels,
  ].some((value) => value?.toLocaleLowerCase().includes(search))
}

function transactionFingerprint(draft: TransactionDraft): Promise<string> {
  return digest(
    JSON.stringify([
      draft.date,
      draft.description,
      draft.amountMinor,
      draft.category,
      draft.transactionType,
      draft.accountName,
      draft.accountType,
      draft.provider,
      draft.labels,
      draft.notes,
    ]),
  )
}

export function createRepositories(db: BudgetLensDatabase): BudgetLensRepositories {
  return {
    transactions: {
      async list(filters = {}) {
        const rows = await db.transactions.toArray()
        return rows
          .filter((transaction) => matchesTransaction(transaction, filters))
          .toSorted((left, right) => right.date.localeCompare(left.date))
      },
      async add(draft) {
        const timestamp = new Date().toISOString()
        const transaction: Transaction = {
          ...draft,
          id: identifier(),
          importBatchId: "manual",
          fingerprint: await transactionFingerprint(draft),
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await db.transactions.add(transaction)
        return transaction
      },
      async update(id, changes) {
        const existing = await db.transactions.get(id)
        if (!existing) throw new Error("Transaction not found.")

        const draft: TransactionDraft = {
          date: changes.date ?? existing.date,
          description: changes.description ?? existing.description,
          amountMinor: changes.amountMinor ?? existing.amountMinor,
          category: changes.category ?? existing.category,
          transactionType: changes.transactionType ?? existing.transactionType,
          accountName: changes.accountName ?? existing.accountName,
          accountType: changes.accountType ?? existing.accountType,
          provider: changes.provider ?? existing.provider,
          labels: changes.labels ?? existing.labels,
          notes: changes.notes ?? existing.notes,
        }
        const updated: Transaction = {
          ...existing,
          ...draft,
          fingerprint: await transactionFingerprint(draft),
          updatedAt: new Date().toISOString(),
        }
        await db.transactions.put(updated)
        return updated
      },
      async remove(id) {
        await db.transactions.delete(id)
      },
      async clear() {
        await db.transactions.clear()
      },
    },
    wealth: {
      async list(filters: WealthFilters = {}) {
        const rows = await db.wealth.toArray()
        return rows
          .filter((snapshot: WealthSnapshot) => {
            if (filters.startDate && snapshot.date < filters.startDate) return false
            if (filters.endDate && snapshot.date > filters.endDate) return false
            return !filters.series?.length || filters.series.includes(snapshot.series)
          })
          .toSorted((left, right) => left.date.localeCompare(right.date))
      },
      async clear() {
        await db.wealth.clear()
      },
    },
    imports: {
      async list() {
        return (await db.imports.toArray()).toSorted((left, right) =>
          right.importedAt.localeCompare(left.importedAt),
        )
      },
      async clear() {
        await db.imports.clear()
      },
    },
    budgets: {
      async list() {
        return db.budgets.orderBy("category").toArray()
      },
      async put(goal: BudgetGoal) {
        await db.budgets.put(goal)
        return goal
      },
      async remove(id) {
        await db.budgets.delete(id)
      },
      async clear() {
        await db.budgets.clear()
      },
    },
  }
}

export const repositories: BudgetLensRepositories = createRepositories(database)
