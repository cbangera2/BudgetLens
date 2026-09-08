import { DEFAULT_SHARE_COUNT, type Transaction, type TransactionDraft } from "@/domain/models"

/**
 * Split transactions: one purchase spread across multiple categories.
 *
 * No database schema changes: splits are represented as linked child rows.
 * - Each child shares the parent's date, carries a description starting with
 *   the parent's description, holds one category, and links back via a
 *   `split:child:<parentId>` entry in its `labels`.
 * - The parent row is kept intact underneath and only gains the
 *   `split:parent-superseded` label. Its amount/date/description/category are
 *   never rewritten by split/unsplit, so unsplitting restores the original
 *   single row exactly (modulo `updatedAt` and the removed marker label).
 *
 * INVARIANT: a split parent is never mutated except for the superseded
 * marker label. Children amounts always sum EXACTLY to the parent amount in
 * minor units (see {@link allocateByWeights}).
 *
 * Display rule: "is split" is derived from children presence
 * ({@link getSplitChildren} / {@link hasSplitChildren}), never from the
 * marker label alone. Aggregate rule: children are ordinary rows; superseded
 * parents are excluded via {@link isSupersededSplitParent} (or equivalently
 * {@link isActiveTransaction} / {@link onlyActiveTransactions}).
 *
 * AGGREGATE AUDIT (every `transactions.list()` consumer found 2026-09-08):
 * Wired (exclude superseded parents):
 * - features/transactions/transactions-page.tsx: visible rows, filter
 *   options, and running balances use `onlyActiveTransactions`.
 * - features/transactions/transaction-detail-page.tsx: split/unsplit UI,
 *   children listing, superseded banner.
 * Deliberately left (outside this feature's ownership; each needs a one-line
 * `onlyActiveTransactions(...)` wrap by its owning agent — children already
 * count as ordinary rows there, only the superseded parent double-counts):
 * - features/budgets/budgets-page.tsx via dashboard calculateBudgetProgress
 * - features/dashboard/dashboard-page.tsx + calculations.ts
 * - features/charts/transforms.ts
 * - features/groups/* (calculations, group-detail-page, groups-page)
 * - features/review/review-page.tsx, features/cashflow/*, features/insights/*
 * - features/notifications/{scheduler,engine}.ts
 * - features/assistant/{data-tools,assistant-panel}.ts(x)
 * - features/settings/{backup,settings-page}.tsx (backup intentionally keeps
 *   every row: it is a fidelity snapshot and the labels preserve linkage)
 * - features/subscriptions/*, features/bill-calendar/*, features/year-review/*
 * - features/transfers/detection.ts, features/widget-bridge/refresh.ts
 */

export const SPLIT_PARENT_LABEL = "split:parent-superseded"
export const SPLIT_CHILD_LABEL_PREFIX = "split:child:"
export const MIN_SPLIT_PARTS = 2
export const MAX_SPLIT_PARTS = 6

export interface SplitPartInput {
  category: string | null
  amountMinor: number
  notes?: string | null
}

/** Parent id encoded in a split-child label, or null when not a split part. */
export function splitChildParentId(transaction: Pick<Transaction, "labels">): string | null {
  for (const label of transaction.labels) {
    if (label.startsWith(SPLIT_CHILD_LABEL_PREFIX)) {
      const parentId = label.slice(SPLIT_CHILD_LABEL_PREFIX.length)
      if (parentId) return parentId
    }
  }
  return null
}

export function isSplitChild(transaction: Pick<Transaction, "labels">): boolean {
  return splitChildParentId(transaction) !== null
}

/**
 * THE central aggregate predicate: true for a kept-underneath parent row
 * that has been superseded by its split children. Totals, budgets, search,
 * and exports must exclude these rows and count children as ordinary rows.
 */
export function isSupersededSplitParent(transaction: Pick<Transaction, "labels">): boolean {
  return transaction.labels.includes(SPLIT_PARENT_LABEL)
}

/** True for every row that aggregates may count (children included). */
export function isActiveTransaction(transaction: Pick<Transaction, "labels">): boolean {
  return !isSupersededSplitParent(transaction)
}

/** Drop superseded split parents; children pass through as ordinary rows. */
export function onlyActiveTransactions(transactions: readonly Transaction[]): Transaction[] {
  return transactions.filter(isActiveTransaction)
}

/**
 * THE query pattern for split display: children of a parent, derived from
 * label linkage. Define once here; every surface reuses this helper.
 */
export function getSplitChildren(
  transactions: readonly Transaction[],
  parentId: string,
): Transaction[] {
  const marker = `${SPLIT_CHILD_LABEL_PREFIX}${parentId}`
  return transactions
    .filter((transaction) => transaction.labels.includes(marker))
    .toSorted(
      (left, right) =>
        left.description.localeCompare(right.description) || left.id.localeCompare(right.id),
    )
}

/** Display rule: a transaction reads as "split" when children are present. */
export function hasSplitChildren(transactions: readonly Transaction[], parentId: string): boolean {
  const marker = `${SPLIT_CHILD_LABEL_PREFIX}${parentId}`
  return transactions.some((transaction) => transaction.labels.includes(marker))
}

/** Parent ids that have at least one linked child (for list-row badges). */
export function collectSplitParentIds(transactions: readonly Transaction[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const transaction of transactions) {
    const parentId = splitChildParentId(transaction)
    if (parentId) ids.add(parentId)
  }
  return ids
}

/**
 * Divide `totalMinor` by positive weights into integer parts that sum
 * EXACTLY to the total. Each part is truncated toward zero and the entire
 * leftover dust (always smaller than the part count) goes to the largest
 * part by absolute value (ties break to the lowest index).
 */
export function allocateByWeights(totalMinor: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(totalMinor)) throw new Error("Total must be whole minor units.")
  if (weights.length === 0) throw new Error("At least one weight is required.")
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new Error("Weights must be positive finite numbers.")
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (!Number.isFinite(totalWeight)) throw new Error("Weights must total a finite number.")
  const parts = weights.map((weight) => Math.trunc((totalMinor * weight) / totalWeight))
  const remainder = totalMinor - parts.reduce((sum, part) => sum + part, 0)
  let target = 0
  for (let index = 1; index < parts.length; index++) {
    if (Math.abs(parts[index] ?? 0) > Math.abs(parts[target] ?? 0)) target = index
  }
  parts[target] = (parts[target] ?? 0) + remainder
  // Math.trunc can produce -0 for tiny negative shares; normalize so
  // zero-amount validation (`=== 0`) and display stay consistent.
  return parts.map((part) => (part === 0 ? 0 : part))
}

/** Even division with remainder-to-largest dust (ties break to part 1). */
export function allocateEvenSplit(totalMinor: number, count: number): number[] {
  if (!Number.isInteger(count) || count < MIN_SPLIT_PARTS) {
    throw new Error(`Split into at least ${MIN_SPLIT_PARTS} parts.`)
  }
  return allocateByWeights(
    totalMinor,
    Array.from({ length: count }, () => 1),
  )
}

/** Child descriptions always start with the parent description. */
export function childDescription(
  parentDescription: string,
  category: string | null,
  index: number,
): string {
  const suffix = category?.trim() ? category.trim().slice(0, 100) : `Part ${index + 1}`
  return `${parentDescription} — ${suffix}`
}

function cleanSplitLabels(labels: readonly string[]): string[] {
  // Strip only live split markers: the parent marker and well-formed child
  // links. Malformed lookalikes (e.g. a bare `split:child:` label, which
  // splitChildParentId does not treat as a link) are user data and survive.
  return labels.filter((label) => {
    if (label === SPLIT_PARENT_LABEL) return false
    if (!label.startsWith(SPLIT_CHILD_LABEL_PREFIX)) return true
    return label.slice(SPLIT_CHILD_LABEL_PREFIX.length) === ""
  })
}

/**
 * Allocation status for the split dialog, compared by magnitude so expense
 * splits read correctly (a -$100 parent with -$50 entered has $50 left, not
 * $50 over).
 */
export function splitRemainingStatus(
  parentMinor: number,
  enteredMinor: number,
): "balanced" | "left" | "over" {
  const remaining = Math.abs(parentMinor) - Math.abs(enteredMinor)
  if (remaining === 0) return "balanced"
  return remaining > 0 ? "left" : "over"
}

/**
 * Reject invalid splits with a human-readable reason, or null when valid.
 * `existingChildren` is the result of {@link getSplitChildren} for the
 * parent; callers pass it so re-splitting is rejected.
 */
export function validateSplitParts(
  parent: Transaction,
  parts: readonly SplitPartInput[],
  existingChildren: readonly Transaction[] = [],
): string | null {
  if (parts.length < MIN_SPLIT_PARTS) return "Split into at least two parts."
  if (parts.length > MAX_SPLIT_PARTS) return `Split into at most ${MAX_SPLIT_PARTS} parts.`
  if (!Number.isInteger(parent.amountMinor) || parent.amountMinor === 0) {
    return "Only transactions with a non-zero amount can be split."
  }
  if (isSupersededSplitParent(parent) || existingChildren.length > 0) {
    return "This transaction is already split. Unsplit it first."
  }
  if (isSplitChild(parent)) return "A split part cannot be split further. Unsplit it first."
  const sign = Math.sign(parent.amountMinor)
  for (const [index, part] of parts.entries()) {
    if (!Number.isInteger(part.amountMinor) || part.amountMinor === 0) {
      return `Part ${index + 1} needs a non-zero amount.`
    }
    if (Math.sign(part.amountMinor) !== sign) {
      return `Part ${index + 1} must match the original ${sign < 0 ? "expense" : "income"} direction.`
    }
  }
  const sum = parts.reduce((total, part) => total + part.amountMinor, 0)
  if (sum !== parent.amountMinor) {
    return `Parts total ${(sum / 100).toFixed(2)} but the transaction is ${(parent.amountMinor / 100).toFixed(2)}.`
  }
  return null
}

export interface BuiltSplit {
  children: TransactionDraft[]
  parentLabels: string[]
}

/** Pure split builder: children drafts plus the parent's new labels. */
export function buildSplitChildren(
  parent: Transaction,
  parts: readonly SplitPartInput[],
): BuiltSplit {
  const error = validateSplitParts(parent, parts)
  if (error) throw new Error(error)
  const inheritedLabels = cleanSplitLabels(parent.labels)
  const children: TransactionDraft[] = parts.map((part, index) => ({
    date: parent.date,
    description: childDescription(parent.description, part.category, index),
    amountMinor: part.amountMinor,
    category: part.category?.trim() ? part.category.trim() : null,
    transactionType: parent.transactionType,
    accountName: parent.accountName,
    accountType: parent.accountType,
    provider: parent.provider,
    labels: [...inheritedLabels, `${SPLIT_CHILD_LABEL_PREFIX}${parent.id}`],
    notes: part.notes?.trim() ? part.notes.trim() : null,
    groupId: parent.groupId,
    // Children are ordinary rows: the shared-cost divisor never propagates.
    shared: false,
    shareCount: DEFAULT_SHARE_COUNT,
  }))
  return { children, parentLabels: [...inheritedLabels, SPLIT_PARENT_LABEL] }
}

/** Pure unsplit helper: the parent's labels with the superseded marker removed. */
export function buildUnsplitParentLabels(parent: Transaction): string[] {
  return parent.labels.filter((label) => label !== SPLIT_PARENT_LABEL)
}
