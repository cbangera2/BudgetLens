import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export interface CloseMonthSummary {
  month: string
  from: string
  to: string
  transactionCount: number
  incomeMinor: number
  expenseMinor: number
  savingsMinor: number
  savingsRate: number | null
  topCategories: Array<{ category: string; amountMinor: number }>
}

export function formatCloseMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    amountMinor / 100,
  )
}

function categoryOf(transaction: Transaction): string {
  const trimmed = transaction.category?.trim()
  return trimmed ? trimmed : "Uncategorized"
}

function monthRangeFor(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const from = `${month}-01`
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from, to: `${month}-${String(lastDay).padStart(2, "0")}` }
}

export function summarizeCloseMonth(
  transactions: readonly Transaction[],
  month: string,
): CloseMonthSummary {
  const range = monthRangeFor(month)
  let incomeMinor = 0
  let expenseMinor = 0
  let transactionCount = 0
  const byCategory = new Map<string, number>()

  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) continue
    transactionCount += 1
    const signed = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (signed > 0) {
      incomeMinor += signed
    } else if (signed < 0) {
      const magnitude = Math.abs(signed)
      expenseMinor += magnitude
      const category = categoryOf(transaction)
      byCategory.set(category, (byCategory.get(category) ?? 0) + magnitude)
    }
  }

  const savingsMinor = incomeMinor - expenseMinor
  const topCategories = [...byCategory.entries()]
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .toSorted(
      (left, right) =>
        right.amountMinor - left.amountMinor || left.category.localeCompare(right.category),
    )
    .slice(0, 3)

  return {
    month,
    from: range.from,
    to: range.to,
    transactionCount,
    incomeMinor,
    expenseMinor,
    savingsMinor,
    savingsRate: incomeMinor === 0 ? null : savingsMinor / incomeMinor,
    topCategories,
  }
}

export function buildCloseVerdict(summary: CloseMonthSummary): string {
  const spent = formatCloseMoney(summary.expenseMinor)
  if (summary.transactionCount === 0) {
    return `No activity recorded for ${summary.month}. Nothing to close.`
  }
  if (summary.savingsRate === null) {
    return `No income in ${summary.month}; spending totaled ${spent}.`
  }
  const percent = Math.round(summary.savingsRate * 100)
  if (summary.savingsRate >= 0.2) {
    return `Steady close for ${summary.month}: saved ${percent}% with ${spent} in spending.`
  }
  if (summary.savingsRate >= 0) {
    return `Calm close for ${summary.month}: saved ${percent}% with ${spent} in spending.`
  }
  return `Tight close for ${summary.month}: spending ${spent} outpaced income.`
}

export interface CloseMonthMover {
  category: string
  currentMinor: number
  previousMinor: number
  deltaMinor: number
  /** Null when the previous month total is zero (division by zero). */
  percent: number | null
  direction: "up" | "down"
}

/** Calendar month immediately before `month` (YYYY-MM), across year boundaries. */
export function previousCloseMonth(month: string): string {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function expenseMinorOf(transaction: Transaction): number {
  const signed = normalizeTransactionAmountMinor(
    transaction.amountMinor,
    transaction.transactionType,
  )
  return signed < 0 ? Math.abs(signed) : 0
}

function categoryTotalsFor(
  transactions: readonly Transaction[],
  month: string,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) continue
    const amount = expenseMinorOf(transaction)
    if (amount <= 0) continue
    const category = categoryOf(transaction)
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }
  return totals
}

/**
 * Month-scoped variance for the close summary: closing month vs the previous
 * calendar month, largest movers first. Computed locally (same shape as the
 * insights digest) because importing the assistant data-tools aggregate would
 * duplicate that whole module into the Review chunk (it is also bundled with
 * the app shell), and its trailing-average scoping does not match a
 * month-close comparison.
 */
export function closeMonthMovers(
  transactions: readonly Transaction[],
  month: string,
  limit = 3,
): { previousMonth: string; movers: CloseMonthMover[] } {
  const previousMonth = previousCloseMonth(month)
  const current = categoryTotalsFor(transactions, month)
  const previous = categoryTotalsFor(transactions, previousMonth)
  const categories = new Set([...current.keys(), ...previous.keys()])
  const movers: CloseMonthMover[] = []
  for (const category of categories) {
    const currentMinor = current.get(category) ?? 0
    const previousMinor = previous.get(category) ?? 0
    const deltaMinor = currentMinor - previousMinor
    if (deltaMinor === 0) continue
    movers.push({
      category,
      currentMinor,
      previousMinor,
      deltaMinor,
      percent: previousMinor === 0 ? null : deltaMinor / previousMinor,
      direction: deltaMinor > 0 ? "up" : "down",
    })
  }
  movers.sort(
    (left, right) =>
      Math.abs(right.deltaMinor) - Math.abs(left.deltaMinor) ||
      left.category.localeCompare(right.category),
  )
  return { previousMonth, movers: movers.slice(0, Math.max(0, limit)) }
}

export function formatCloseMover(mover: CloseMonthMover): string {
  const current = formatCloseMoney(mover.currentMinor)
  const previous = formatCloseMoney(mover.previousMinor)
  if (mover.percent === null) return `${mover.category}: ${current} (new vs ${previous})`
  const sign = mover.percent >= 0 ? "+" : ""
  return `${mover.category}: ${current} vs ${previous} (${sign}${(mover.percent * 100).toFixed(1)}%)`
}

export function uncategorizedForMonth(
  transactions: readonly Transaction[],
  month: string,
): Transaction[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.date.startsWith(month) && (transaction.category ?? "").trim() === "",
    )
    .toSorted((left, right) =>
      left.date === right.date
        ? left.description.localeCompare(right.description)
        : left.date.localeCompare(right.date),
    )
}
