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

export function buildCloseShareText(
  summary: CloseMonthSummary,
  verdict: string,
  anomalyLines: string[],
): string {
  const lines = [
    `Monthly close ${summary.month}`,
    `Income ${formatCloseMoney(summary.incomeMinor)} · Spending ${formatCloseMoney(summary.expenseMinor)} · Saved ${formatCloseMoney(summary.savingsMinor)}`,
    verdict,
  ]
  if (anomalyLines.length > 0) {
    lines.push("Highlights:")
    for (const line of anomalyLines.slice(0, 3)) lines.push(`- ${line}`)
  }
  return lines.join("\n")
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
