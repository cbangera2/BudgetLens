import type { Transaction } from "@/domain/models"
import type { BudgetLensRepositories } from "@/domain/repositories"

import {
  buildSplitChildren,
  buildUnsplitParentLabels,
  getSplitChildren,
  isSupersededSplitParent,
  validateSplitParts,
  type SplitPartInput,
} from "./splits"

type SplitStore = Pick<BudgetLensRepositories, "transactions">

export interface SplitResult {
  parent: Transaction
  children: Transaction[]
}

async function removeBestEffort(store: SplitStore, id: string): Promise<void> {
  try {
    await store.transactions.remove(id)
  } catch {
    // Rollback cleanup never masks the original failure.
  }
}

/**
 * Split a transaction into per-category children. The parent row stays
 * intact underneath (only its labels gain the superseded marker); children
 * sum exactly to the parent amount. Rolls back created children if the
 * parent update fails.
 */
export async function splitTransaction(
  store: SplitStore,
  parentId: string,
  parts: readonly SplitPartInput[],
): Promise<SplitResult> {
  const parent = await store.transactions.get(parentId)
  if (!parent) throw new Error("Transaction not found.")
  const existingChildren = getSplitChildren(await store.transactions.list(), parentId)
  const error = validateSplitParts(parent, parts, existingChildren)
  if (error) throw new Error(error)

  const { children: drafts, parentLabels } = buildSplitChildren(parent, parts)
  const children: Transaction[] = []
  try {
    for (const draft of drafts) {
      // oxlint-disable-next-line no-await-in-loop -- Order keeps child display stable.
      children.push(await store.transactions.add(draft))
    }
  } catch (cause) {
    for (const child of children) {
      // oxlint-disable-next-line no-await-in-loop -- Best-effort rollback in order.
      await removeBestEffort(store, child.id)
    }
    throw cause
  }

  try {
    const updated = await store.transactions.update(parentId, { labels: parentLabels })
    return { parent: updated, children }
  } catch (cause) {
    for (const child of children) {
      // oxlint-disable-next-line no-await-in-loop -- Best-effort rollback in order.
      await removeBestEffort(store, child.id)
    }
    throw cause
  }
}

/**
 * Unsplit a transaction: delete its children and restore the original
 * single row by removing the superseded marker. The parent's
 * amount/date/description/category were never rewritten, so the restored
 * row matches the original.
 */
export async function unsplitTransaction(
  store: SplitStore,
  parentId: string,
): Promise<Transaction> {
  const parent = await store.transactions.get(parentId)
  if (!parent) throw new Error("Transaction not found.")
  const children = getSplitChildren(await store.transactions.list(), parentId)
  if (!isSupersededSplitParent(parent) && children.length === 0) {
    throw new Error("Transaction is not split.")
  }
  for (const child of children) {
    // oxlint-disable-next-line no-await-in-loop -- Deterministic removal order.
    await store.transactions.remove(child.id)
  }
  return store.transactions.update(parentId, { labels: buildUnsplitParentLabels(parent) })
}
