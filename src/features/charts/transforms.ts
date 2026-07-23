import type { Transaction, WealthSnapshot } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

import type { ChartFilters, ChartMetric } from "./model"

export type RendererMoney = number

export interface MonthlyChartPoint {
  month: string
  income: RendererMoney
  expenses: RendererMoney
  savings: RendererMoney
  netWorth: RendererMoney | null
  investments: RendererMoney | null
}

export interface CategoryChartPoint {
  category: string
  value: RendererMoney
  percentage: number
}

interface MonthlyMinorPoint {
  month: string
  incomeMinor: number
  expensesMinor: number
  netWorthMinor: number | null
  investmentsMinor: number | null
}

function isIncluded(value: string | null, selected: readonly string[]): boolean {
  return selected.length === 0 || (value !== null && selected.includes(value))
}

export function filterChartTransactions(
  transactions: readonly Transaction[],
  filters: ChartFilters,
): Transaction[] {
  return transactions.filter(
    (transaction) =>
      (!filters.date.start || transaction.date >= filters.date.start) &&
      (!filters.date.end || transaction.date <= filters.date.end) &&
      isIncluded(transaction.category, filters.categories) &&
      isIncluded(transaction.description, filters.descriptions) &&
      isIncluded(transaction.transactionType, filters.transactionTypes),
  )
}

function isWealthInRange(snapshot: WealthSnapshot, filters: ChartFilters): boolean {
  return (
    (!filters.date.start || snapshot.date >= filters.date.start) &&
    (!filters.date.end || snapshot.date <= filters.date.end)
  )
}

/**
 * Aggregates using integer minor units, selecting the latest wealth snapshot in each month.
 * Conversion to major money units happens exactly once at the renderer boundary.
 */
export function buildMonthlyChartData(
  transactions: readonly Transaction[],
  wealthSnapshots: readonly WealthSnapshot[],
  filters: ChartFilters,
): MonthlyChartPoint[] {
  const points = new Map<string, MonthlyMinorPoint>()
  const pointFor = (month: string): MonthlyMinorPoint => {
    const existing = points.get(month)
    if (existing) return existing
    const created: MonthlyMinorPoint = {
      month,
      incomeMinor: 0,
      expensesMinor: 0,
      netWorthMinor: null,
      investmentsMinor: null,
    }
    points.set(month, created)
    return created
  }

  for (const transaction of filterChartTransactions(transactions, filters)) {
    const point = pointFor(transaction.date.slice(0, 7))
    const amountMinor = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (amountMinor >= 0) point.incomeMinor += amountMinor
    else point.expensesMinor += Math.abs(amountMinor)
  }

  const latestSnapshot = new Map<string, WealthSnapshot>()
  for (const snapshot of wealthSnapshots) {
    if (!isWealthInRange(snapshot, filters)) continue
    const key = `${snapshot.date.slice(0, 7)}:${snapshot.series}`
    const previous = latestSnapshot.get(key)
    if (!previous || snapshot.date > previous.date) latestSnapshot.set(key, snapshot)
  }
  for (const snapshot of latestSnapshot.values()) {
    const point = pointFor(snapshot.date.slice(0, 7))
    if (snapshot.series === "netWorth") point.netWorthMinor = snapshot.valueMinor
    else point.investmentsMinor = snapshot.valueMinor
  }

  return [...points.values()]
    .toSorted((left, right) => left.month.localeCompare(right.month))
    .map((point) => ({
      month: point.month,
      income: point.incomeMinor / 100,
      expenses: point.expensesMinor / 100,
      savings: (point.incomeMinor - point.expensesMinor) / 100,
      netWorth: point.netWorthMinor === null ? null : point.netWorthMinor / 100,
      investments: point.investmentsMinor === null ? null : point.investmentsMinor / 100,
    }))
}

/** Category slices are meaningful for transaction metrics; wealth metrics return no slices. */
export function buildCategoryChartData(
  transactions: readonly Transaction[],
  filters: ChartFilters,
  metric: ChartMetric,
): CategoryChartPoint[] {
  if (metric === "netWorth" || metric === "investments") return []

  const totals = new Map<string, number>()
  for (const transaction of filterChartTransactions(transactions, filters)) {
    const category = transaction.category?.trim() || "Uncategorized"
    const amountMinor = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    const amount =
      metric === "income"
        ? Math.max(0, amountMinor)
        : metric === "expenses"
          ? Math.max(0, -amountMinor)
          : amountMinor
    if (amount === 0) continue
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }

  // Negative savings slices cannot be represented by a pie. Keep only positive contributions.
  const positive = [...totals.entries()].filter(([, amountMinor]) => amountMinor > 0)
  const totalMinor = positive.reduce((sum, [, amountMinor]) => sum + amountMinor, 0)
  return positive
    .map(([category, amountMinor]) => ({
      category,
      value: amountMinor / 100,
      percentage: totalMinor === 0 ? 0 : amountMinor / totalMinor,
    }))
    .toSorted(
      (left, right) => right.value - left.value || left.category.localeCompare(right.category),
    )
}
