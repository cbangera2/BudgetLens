import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export type TransactionColumnKey = "date" | "amount" | "merchant"
export type TransactionColumnDirection = "asc" | "desc"

export interface TransactionColumnSort {
  key: TransactionColumnKey
  direction: TransactionColumnDirection
}

export type TransactionColumnSortState = TransactionColumnSort | null

/**
 * Cycle a sortable column header: none -> asc -> desc -> none.
 * Clicking a different column always starts at asc.
 */
export function nextColumnSort(
  current: TransactionColumnSortState,
  clicked: TransactionColumnKey,
): TransactionColumnSortState {
  if (!current || current.key !== clicked) return { key: clicked, direction: "asc" }
  if (current.direction === "asc") return { key: clicked, direction: "desc" }
  return null
}

function isBlankDate(value: unknown): value is null | undefined | "" {
  return value === null || value === undefined || value === ""
}

function nullableNormalizedAmount(
  transaction: Pick<Transaction, "amountMinor" | "transactionType">,
): number | null {
  const raw = transaction.amountMinor
  if (!Number.isFinite(raw)) return null
  return normalizeTransactionAmountMinor(raw, transaction.transactionType ?? null)
}

function compareNullableStrings(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: TransactionColumnDirection,
): number {
  if (!left && !right) return 0
  // Blank / null values always sort last regardless of direction.
  if (!left) return 1
  if (!right) return -1
  const order = left.localeCompare(right, undefined, { sensitivity: "base" })
  return direction === "asc" ? order : -order
}

/**
 * Compare two transactions by a sortable column. Null-ish values sort last
 * in both directions; ties fall back to id order for stability.
 */
export function compareTransactionsByColumn(
  left: Transaction,
  right: Transaction,
  key: TransactionColumnKey,
  direction: TransactionColumnDirection,
): number {
  if (key === "date") {
    const dateOrder = compareNullableStrings(
      isBlankDate(left.date) ? null : left.date,
      isBlankDate(right.date) ? null : right.date,
      direction,
    )
    if (dateOrder !== 0) return dateOrder
    return left.id.localeCompare(right.id)
  }
  if (key === "amount") {
    const leftAmount = nullableNormalizedAmount(left)
    const rightAmount = nullableNormalizedAmount(right)
    if (leftAmount === null && rightAmount === null) return left.id.localeCompare(right.id)
    if (leftAmount === null) return 1
    if (rightAmount === null) return -1
    if (leftAmount !== rightAmount)
      return direction === "asc" ? leftAmount - rightAmount : rightAmount - leftAmount
    return left.id.localeCompare(right.id)
  }
  const merchantOrder = compareNullableStrings(
    left.description ?? null,
    right.description ?? null,
    direction,
  )
  if (merchantOrder !== 0) return merchantOrder
  return left.id.localeCompare(right.id)
}

/** Sort a copy of rows by the active column; null (none) preserves input order. */
export function sortTransactionsByColumn(
  rows: readonly Transaction[],
  sort: TransactionColumnSortState,
): Transaction[] {
  if (!sort) return [...rows]
  return [...rows].toSorted((left, right) =>
    compareTransactionsByColumn(left, right, sort.key, sort.direction),
  )
}

function parseIsoDateUtc(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const time = Date.UTC(year, month - 1, day)
  const check = new Date(time)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }
  return time
}

/**
 * Human relative date beside the absolute value ("today", "yesterday",
 * "3 days ago", "in 2 days", "2 months ago", "1 year ago").
 */
export function formatRelativeDate(isoDate: string, now: Date = new Date()): string {
  const target = parseIsoDateUtc(isoDate)
  if (target === null) return ""
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const daysAgo = Math.round((nowMidnight - target) / 86_400_000)
  if (daysAgo === 0) return "today"
  if (daysAgo === 1) return "yesterday"
  if (daysAgo === -1) return "tomorrow"
  if (daysAgo > 1 && daysAgo < 30) return `${daysAgo} days ago`
  if (daysAgo < -1 && daysAgo > -30) return `in ${Math.abs(daysAgo)} days`
  const absolute = Math.abs(daysAgo)
  if (absolute < 365) {
    const months = Math.max(1, Math.round(absolute / 30.44))
    if (months <= 1) return daysAgo > 0 ? "1 month ago" : "in 1 month"
    return daysAgo > 0 ? `${months} months ago` : `in ${months} months`
  }
  const years = Math.max(1, Math.round(absolute / 365.25))
  if (years <= 1) return daysAgo > 0 ? "1 year ago" : "in 1 year"
  return daysAgo > 0 ? `${years} years ago` : `in ${years} years`
}

/** Grouping key for per-account running balances. */
export function runningBalanceAccountKey(
  transaction: Pick<Transaction, "accountName" | "accountType">,
): string {
  return transaction.accountName ?? transaction.accountType ?? ""
}

/**
 * Per-account running balances over the given history. Rows are accumulated
 * in chronological (date asc, id asc) order using normalized signed amounts;
 * the returned map holds the balance *after* each transaction id.
 */
export function computeRunningBalances(transactions: readonly Transaction[]): Map<string, number> {
  const ordered = [...transactions].toSorted((left, right) =>
    left.date === right.date
      ? left.id.localeCompare(right.id)
      : left.date.localeCompare(right.date),
  )
  const totals = new Map<string, number>()
  const balances = new Map<string, number>()
  for (const transaction of ordered) {
    const key = runningBalanceAccountKey(transaction)
    const amount = nullableNormalizedAmount(transaction) ?? 0
    const next = (totals.get(key) ?? 0) + amount
    totals.set(key, next)
    balances.set(transaction.id, next)
  }
  return balances
}

/** Toggle one id in a selection set without mutating the input. */
export function toggleIdInSelection(
  selected: ReadonlySet<string>,
  id: string,
  checked: boolean,
): Set<string> {
  const next = new Set(selected)
  if (checked) next.add(id)
  else next.delete(id)
  return next
}

/** True when two per-transaction receipt-count maps hold the same entries. */
export function areReceiptCountsEqual(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): boolean {
  if (left.size !== right.size) return false
  for (const [id, count] of left) {
    if (right.get(id) !== count) return false
  }
  return true
}

/**
 * Keep the current page inside the valid range after the result set shrinks
 * (for example a bulk delete emptying the final page). Always at least 1.
 */
export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), Math.max(1, pageCount))
}

/**
 * Whether a row click should be ignored for selection. Clicks originating
 * inside interactive descendants (including SVG icon nodes, which are Elements
 * but not HTMLElements) must not toggle the row.
 */
export function shouldIgnoreRowClick(target: unknown): boolean {
  if (target instanceof Element) {
    return target.closest("button, a, input, select, label") !== null
  }
  return false
}

/** Inclusive id range between two anchors in display order (either direction). */
export function orderedRangeIds(
  orderedIds: readonly string[],
  fromId: string | null,
  toId: string,
): string[] {
  if (!fromId) return [toId]
  const fromIndex = orderedIds.indexOf(fromId)
  const toIndex = orderedIds.indexOf(toId)
  if (fromIndex === -1 || toIndex === -1) return [toId]
  const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
  return orderedIds.slice(start, end + 1)
}

/** Apply a (possibly shift-range) toggle to a selection set. */
export function applyRangeToSelection(
  selected: ReadonlySet<string>,
  orderedIds: readonly string[],
  fromId: string | null,
  toId: string,
  checked: boolean,
): Set<string> {
  const next = new Set(selected)
  for (const id of orderedRangeIds(orderedIds, fromId, toId)) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  return next
}
