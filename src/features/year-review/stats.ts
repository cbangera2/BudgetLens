import type { Transaction, WealthSnapshot } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export interface YearReviewTopCategory {
  category: string
  amountMinor: number
  share: number
}

export interface YearReviewBiggestMonth {
  month: string
  expenseMinor: number
}

export interface YearReviewStats {
  year: number
  transactionCount: number
  incomeMinor: number
  expenseMinor: number
  savingsMinor: number
  savingsRate: number | null
  topCategories: YearReviewTopCategory[]
  biggestMonth: YearReviewBiggestMonth | null
  netWorthStartMinor: number | null
  netWorthEndMinor: number | null
  netWorthDeltaMinor: number | null
}

function isYearDate(date: string, year: number): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 4) === String(year)
}

function parseYearOf(date: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(date)
  if (!match?.[1]) return null
  const year = Number(match[1])
  return Number.isInteger(year) ? year : null
}

function collectDataYears(
  transactions: readonly Transaction[],
  wealth: readonly WealthSnapshot[],
): number[] {
  const years: number[] = []
  for (const transaction of transactions) {
    const year = parseYearOf(transaction.date)
    if (year !== null) years.push(year)
  }
  for (const snapshot of wealth) {
    const year = parseYearOf(snapshot.date)
    if (year !== null) years.push(year)
  }
  return years
}

/**
 * Default picker selection: the most recent year present in data (the current
 * year is often still empty), falling back to the current year when empty.
 * Wealth-only years count so a net-worth review stays reachable.
 */
export function defaultReviewYear(
  transactions: readonly Transaction[],
  currentYear = new Date().getFullYear(),
  wealth: readonly WealthSnapshot[] = [],
): number {
  let latest: number | null = null
  for (const year of collectDataYears(transactions, wealth)) {
    if (latest === null || year > latest) latest = year
  }
  return latest ?? currentYear
}

/**
 * Years selectable in the year-in-review picker: the current year plus every
 * year present in transaction or wealth-snapshot dates, newest first, with no
 * hardcoding. Wealth-only years are included so the net-worth delta review
 * stays selectable.
 */
export function availableReviewYears(
  transactions: readonly Transaction[],
  currentYear = new Date().getFullYear(),
  wealth: readonly WealthSnapshot[] = [],
): number[] {
  const years = new Set<number>([currentYear])
  for (const year of collectDataYears(transactions, wealth)) {
    years.add(year)
  }
  return [...years].toSorted((left, right) => right - left)
}

/**
 * Year stats for the share card. Follows the dashboard calculation patterns
 * (signed amounts via normalizeTransactionAmountMinor, "Uncategorized"
 * fallback, expense-only category totals sorted by amount then name, monthly
 * grouping on the YYYY-MM prefix) and the net-worth start-to-end delta
 * pattern (null delta with fewer than two observations in the year).
 */
export function buildYearReviewStats(
  year: number,
  transactions: readonly Transaction[],
  wealth: readonly WealthSnapshot[] = [],
): YearReviewStats {
  const yearTransactions = transactions.filter((transaction) => isYearDate(transaction.date, year))

  let incomeMinor = 0
  let expenseMinor = 0
  const categoryTotals = new Map<string, number>()
  const monthlyExpenses = new Map<string, number>()

  for (const transaction of yearTransactions) {
    const amountMinor = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (amountMinor > 0) {
      incomeMinor += amountMinor
    } else if (amountMinor < 0) {
      const absolute = Math.abs(amountMinor)
      expenseMinor += absolute
      const category = transaction.category?.trim() || "Uncategorized"
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + absolute)
      const month = transaction.date.slice(0, 7)
      monthlyExpenses.set(month, (monthlyExpenses.get(month) ?? 0) + absolute)
    }
  }

  const savingsMinor = incomeMinor - expenseMinor
  const totalCategoryMinor = [...categoryTotals.values()].reduce((sum, amount) => sum + amount, 0)
  const topCategories: YearReviewTopCategory[] = [...categoryTotals.entries()]
    .map(([category, amountMinor]) => ({
      category,
      amountMinor,
      share: totalCategoryMinor === 0 ? 0 : amountMinor / totalCategoryMinor,
    }))
    .toSorted(
      (left, right) =>
        right.amountMinor - left.amountMinor || left.category.localeCompare(right.category),
    )
    .slice(0, 3)

  let biggestMonth: YearReviewBiggestMonth | null = null
  for (const [month, monthExpenseMinor] of monthlyExpenses) {
    if (
      biggestMonth === null ||
      monthExpenseMinor > biggestMonth.expenseMinor ||
      (monthExpenseMinor === biggestMonth.expenseMinor && month < biggestMonth.month)
    ) {
      biggestMonth = { month, expenseMinor: monthExpenseMinor }
    }
  }

  const yearNetWorth = wealth
    .filter((snapshot) => snapshot.series === "netWorth" && isYearDate(snapshot.date, year))
    .toSorted((left, right) => left.date.localeCompare(right.date))
  const start = yearNetWorth[0] ?? null
  const end = yearNetWorth.at(-1) ?? null

  return {
    year,
    transactionCount: yearTransactions.length,
    incomeMinor,
    expenseMinor,
    savingsMinor,
    savingsRate: incomeMinor === 0 ? null : savingsMinor / incomeMinor,
    topCategories,
    biggestMonth,
    netWorthStartMinor: start?.valueMinor ?? null,
    netWorthEndMinor: end?.valueMinor ?? null,
    netWorthDeltaMinor:
      start !== null && end !== null && yearNetWorth.length > 1
        ? end.valueMinor - start.valueMinor
        : null,
  }
}
