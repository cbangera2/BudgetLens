import { database, type BudgetLensDatabase } from "@/db/database"
import type {
  BudgetGoal,
  Transaction,
  TransactionDraft,
  TransactionFilters,
  TransactionGroup,
  TransactionGroupFilters,
  SnapshotDateFilters,
  WealthAccountSnapshot,
  WealthBreakdownSnapshot,
  WealthFilters,
  WealthSnapshot,
} from "@/domain/models"
import { DEFAULT_SHARE_COUNT } from "@/domain/models"
import type { BudgetLensRepositories, TransactionGroupInput } from "@/domain/repositories"

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

function withinSnapshotDates(snapshot: { date: string }, filters: SnapshotDateFilters): boolean {
  if (filters.startDate && snapshot.date < filters.startDate) return false
  if (filters.endDate && snapshot.date > filters.endDate) return false
  return true
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

function normalizeGroupFields(
  draft: Pick<TransactionDraft, "groupId" | "shared" | "shareCount">,
): Pick<Transaction, "groupId" | "shared" | "shareCount"> {
  return {
    groupId: draft.groupId ?? null,
    shared: draft.shared ?? false,
    shareCount: draft.shareCount ?? DEFAULT_SHARE_COUNT,
  }
}

/**
 * Merge partial changes onto an existing transaction. Group/shared fields use
 * `in` checks so they can be explicitly cleared back to their empty values.
 */
function mergeTransactionChanges(
  existing: Transaction,
  changes: Partial<TransactionDraft>,
): TransactionDraft {
  const merged: TransactionDraft = {
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
    ...normalizeGroupFields({
      groupId: "groupId" in changes ? (changes.groupId ?? null) : existing.groupId,
      shared: "shared" in changes ? (changes.shared ?? false) : existing.shared,
      shareCount:
        "shareCount" in changes ? (changes.shareCount ?? DEFAULT_SHARE_COUNT) : existing.shareCount,
    }),
  }
  return merged
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
      async get(id) {
        return db.transactions.get(id)
      },
      async add(draft) {
        const timestamp = new Date().toISOString()
        const transaction: Transaction = {
          ...draft,
          ...normalizeGroupFields(draft),
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

        const draft = mergeTransactionChanges(existing, changes)
        const updated: Transaction = {
          ...existing,
          ...draft,
          fingerprint: await transactionFingerprint(draft),
          updatedAt: new Date().toISOString(),
        }
        await db.transactions.put(updated)
        return updated
      },
      async updateMany(ids, changes) {
        for (const id of ids) await this.update(id, changes)
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
    wealthBreakdown: {
      async list(filters = {}) {
        return (await db.wealthBreakdown.toArray())
          .filter((snapshot: WealthBreakdownSnapshot) => withinSnapshotDates(snapshot, filters))
          .toSorted((left, right) =>
            left.date === right.date
              ? left.segment.localeCompare(right.segment)
              : left.date.localeCompare(right.date),
          )
      },
      async clear() {
        await db.wealthBreakdown.clear()
      },
    },
    wealthAccounts: {
      async list(filters = {}) {
        return (await db.wealthAccounts.toArray())
          .filter((snapshot: WealthAccountSnapshot) => withinSnapshotDates(snapshot, filters))
          .toSorted((left, right) =>
            left.date === right.date
              ? left.sourceLabel.localeCompare(right.sourceLabel)
              : left.date.localeCompare(right.date),
          )
      },
      async clear() {
        await db.wealthAccounts.clear()
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
    transactionGroups: {
      async list(filters: TransactionGroupFilters = {}) {
        const groups = await db.transactionGroups.toArray()
        return groups
          .filter((group) => filters.includeArchived || !group.archived)
          .toSorted((left, right) =>
            left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
          )
      },
      async get(id) {
        return db.transactionGroups.get(id)
      },
      async put(input: TransactionGroupInput) {
        const timestamp = new Date().toISOString()
        const existing = input.id ? await db.transactionGroups.get(input.id) : undefined
        const group: TransactionGroup = {
          id: existing?.id ?? identifier(),
          name: input.name,
          description: input.description ?? existing?.description ?? null,
          color: input.color ?? existing?.color ?? "violet",
          startDate: input.startDate ?? existing?.startDate ?? null,
          endDate: input.endDate ?? existing?.endDate ?? null,
          budgetMinor: input.budgetMinor ?? existing?.budgetMinor ?? null,
          archived: input.archived ?? existing?.archived ?? false,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
        await db.transactionGroups.put(group)
        return group
      },
      async remove(id) {
        // Deleting a group keeps its transactions; they just leave the group.
        await db.transaction("rw", [db.transactionGroups, db.transactions], async () => {
          const members = await db.transactions.where("groupId").equals(id).toArray()
          await Promise.all(
            members.map((member) => db.transactions.put({ ...member, groupId: null })),
          )
          await db.transactionGroups.delete(id)
        })
      },
      async members(id) {
        return (await db.transactions.where("groupId").equals(id).toArray()).toSorted(
          (left, right) => right.date.localeCompare(left.date),
        )
      },
      async clear() {
        await db.transactionGroups.clear()
      },
    },
  }
}

export const repositories: BudgetLensRepositories = createRepositories(database)
