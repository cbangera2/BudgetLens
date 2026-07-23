import type { BudgetGoal, Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export interface FinancialMetrics {
  incomeMinor: number
  expenseMinor: number
  savingsMinor: number
  savingsRate: number | null
  transactionCount: number
}

export interface MonthlyCashFlow extends FinancialMetrics {
  month: string
}

export interface CategorySpending {
  category: string
  amountMinor: number
  share: number
}

export interface BudgetProgress {
  goal: BudgetGoal
  spentMinor: number
  remainingMinor: number
  progress: number
  status: "on-track" | "near-limit" | "over-budget"
}

export function calculateMetrics(transactions: readonly Transaction[]): FinancialMetrics {
  let incomeMinor = 0
  let expenseMinor = 0

  for (const transaction of transactions) {
    const amountMinor = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (amountMinor > 0) incomeMinor += amountMinor
    if (amountMinor < 0) expenseMinor += Math.abs(amountMinor)
  }

  const savingsMinor = incomeMinor - expenseMinor
  return {
    incomeMinor,
    expenseMinor,
    savingsMinor,
    savingsRate: incomeMinor === 0 ? null : savingsMinor / incomeMinor,
    transactionCount: transactions.length,
  }
}

export function calculateMonthlyCashFlow(transactions: readonly Transaction[]): MonthlyCashFlow[] {
  const byMonth = new Map<string, Transaction[]>()
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7)
    byMonth.set(month, [...(byMonth.get(month) ?? []), transaction])
  }

  return [...byMonth.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([month, monthTransactions]) => ({ month, ...calculateMetrics(monthTransactions) }))
}

export function calculateCategorySpending(
  transactions: readonly Transaction[],
): CategorySpending[] {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    const amountMinor = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (amountMinor >= 0) continue
    const category = transaction.category?.trim() || "Uncategorized"
    totals.set(category, (totals.get(category) ?? 0) + Math.abs(amountMinor))
  }

  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0)
  return [...totals.entries()]
    .map(([category, amountMinor]) => ({
      category,
      amountMinor,
      share: total === 0 ? 0 : amountMinor / total,
    }))
    .toSorted(
      (left, right) =>
        right.amountMinor - left.amountMinor || left.category.localeCompare(right.category),
    )
}

export function calculateBudgetProgress(
  goal: BudgetGoal,
  transactions: readonly Transaction[],
  referenceDate: string,
): BudgetProgress {
  const periodPrefix =
    goal.period === "monthly" ? referenceDate.slice(0, 7) : referenceDate.slice(0, 4)
  const spentMinor = transactions
    .filter(
      (transaction) =>
        normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType) < 0 &&
        transaction.category === goal.category &&
        transaction.date.startsWith(periodPrefix),
    )
    .reduce(
      (sum, transaction) =>
        sum +
        Math.abs(
          normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType),
        ),
      0,
    )
  const progress = goal.amountMinor <= 0 ? 0 : spentMinor / goal.amountMinor

  return {
    goal,
    spentMinor,
    remainingMinor: goal.amountMinor - spentMinor,
    progress,
    status: progress > 1 ? "over-budget" : progress >= 0.8 ? "near-limit" : "on-track",
  }
}
