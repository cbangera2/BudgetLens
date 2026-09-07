import { toast } from "sonner"

import { repositories } from "@/db/repositories"
import type { BudgetGoal, Transaction, TransactionGroup } from "@/domain/models"
import type { BudgetLensRepositories } from "@/domain/repositories"

/**
 * How long a deleted snapshot stays restorable. The buffer is memory-only: a
 * reload or a second delete discards the undo window.
 */
export const UNDO_TTL_MS = 8_000

export type UndoSnapshot =
  | { kind: "transaction"; transaction: Transaction }
  | { kind: "budget"; budget: BudgetGoal }
  | { kind: "group"; group: TransactionGroup; memberIds: string[] }

interface UndoSlot {
  entry: UndoSnapshot
  expiresAt: number
  token: number
}

let slot: UndoSlot | null = null
let nextToken = 1

/** Stash a deleted snapshot, discarding any previous one. Returns a claim token. */
export function stashUndo(entry: UndoSnapshot, now: number = Date.now()): number {
  const token = nextToken
  nextToken += 1
  slot = { entry, expiresAt: now + UNDO_TTL_MS, token }
  return token
}

/** Inspect the buffered snapshot without consuming it. Returns null when empty/expired. */
export function peekUndo(now: number = Date.now()): UndoSnapshot | null {
  if (!slot) return null
  if (now > slot.expiresAt) {
    slot = null
    return null
  }
  return slot.entry
}

/**
 * Claim the buffered snapshot and clear the slot. When a token is given, only
 * the matching stash is claimed, so a stale Undo action from an earlier toast
 * can never restore over (or steal) a newer delete.
 */
export function takeUndo(token?: number, now: number = Date.now()): UndoSnapshot | null {
  if (!slot) return null
  if (now > slot.expiresAt) {
    slot = null
    return null
  }
  if (token !== undefined && token !== slot.token) return null
  const entry = slot.entry
  slot = null
  return entry
}

/** Discard the buffered snapshot, if any. */
export function clearUndo(): void {
  slot = null
}

/**
 * Restore a claimed snapshot through the matching repository.
 *
 * ID handling per entity (repository API constraints):
 * - transaction: `transactions.add` always mints a fresh id, so undo creates a
 *   new row with identical field values (fresh fingerprint/createdAt/updatedAt).
 * - budget: `budgets.put` writes the full goal including its id, so the
 *   original id is reused.
 * - group: `transactionGroups.put` only reuses the input id for rows that still
 *   exist, so undoing a delete creates a row with a fresh id (same field
 *   values); member transactions detached by the delete are re-attached to the
 *   restored group, but only when still unassigned, so a member moved elsewhere
 *   is never stolen back.
 */
export async function restoreUndo(
  entry: UndoSnapshot,
  repos: BudgetLensRepositories = repositories,
): Promise<void> {
  switch (entry.kind) {
    case "transaction": {
      const { transaction } = entry
      await repos.transactions.add({
        date: transaction.date,
        description: transaction.description,
        amountMinor: transaction.amountMinor,
        category: transaction.category,
        transactionType: transaction.transactionType,
        accountName: transaction.accountName,
        accountType: transaction.accountType,
        provider: transaction.provider,
        labels: [...transaction.labels],
        notes: transaction.notes,
        groupId: transaction.groupId,
        shared: transaction.shared,
        shareCount: transaction.shareCount,
      })
      return
    }
    case "budget": {
      await repos.budgets.put({ ...entry.budget })
      return
    }
    case "group": {
      const restored = await repos.transactionGroups.put({
        id: entry.group.id,
        name: entry.group.name,
        description: entry.group.description,
        color: entry.group.color,
        startDate: entry.group.startDate,
        endDate: entry.group.endDate,
        budgetMinor: entry.group.budgetMinor,
        archived: entry.group.archived,
      })
      const members = await Promise.all(entry.memberIds.map((id) => repos.transactions.get(id)))
      const reattach = members
        .filter((member): member is Transaction => member !== undefined && member.groupId === null)
        .map((member) => member.id)
      if (reattach.length > 0) {
        await repos.transactions.updateMany(reattach, { groupId: restored.id })
      }
      return
    }
  }
}

interface NotifyOptions {
  onRestored?: () => void
  repos?: BudgetLensRepositories
}

/**
 * Stash a freshly confirmed delete and toast an Undo action. The toast action
 * claims by token, so after a second delete (or TTL expiry) the stale Undo
 * reports expiry instead of restoring.
 */
export function notifyDeletedWithUndo(
  label: string,
  entry: UndoSnapshot,
  options: NotifyOptions = {},
): number {
  const token = stashUndo(entry)
  toast(`${label} deleted`, {
    description: "Undo available for a few seconds.",
    duration: UNDO_TTL_MS,
    action: {
      label: "Undo",
      onClick: () => {
        void (async () => {
          const claimed = takeUndo(token)
          if (!claimed) {
            toast.error("Undo expired")
            return
          }
          try {
            await restoreUndo(claimed, options.repos ?? repositories)
            toast.success(`${label} restored`)
            options.onRestored?.()
          } catch {
            toast.error(`Could not restore ${label.toLowerCase()}`)
          }
        })()
      },
    },
  })
  return token
}
