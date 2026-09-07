/**
 * Pure budget-template math: ratio splits, goal planning, skip-existing
 * partitioning, and income detection.
 *
 * All money is integer minor units. Every split uses largest-remainder so the
 * parts always sum back to the input total (rounding dust is conserved, never
 * dropped or created). Nothing here touches the database; callers persist via
 * `repositories.budgets.put`.
 */

import type { BudgetGoal, Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export const SAVINGS_CATEGORY = "Savings"
export const NEEDS_CATEGORY = "Needs"
export const WANTS_CATEGORY = "Wants"
/**
 * Named bucket for spend from transactions without a category. Template output
 * never silently drops uncategorized spend; it lands here.
 */
export const EVERYTHING_ELSE_CATEGORY = "Everything else"

export type PlannedGoalBucket = "needs" | "wants" | "savings" | "spending"

export interface PlannedGoal {
  category: string
  amountMinor: number
  period: BudgetGoal["period"]
  bucket: PlannedGoalBucket
}

export interface CategoryWeight {
  category: string
  spendMinor: number
}

export interface DetectedIncome {
  averageMinor: number
  monthCount: number
  totalMinor: number
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/

/**
 * Splits `totalMinor` across `weights` proportionally using largest-remainder:
 * every part is floored, then leftover cents go one each to the parts with the
 * largest fractional remainders (ties break toward the earlier part, so the
 * result is deterministic). The returned parts always sum to `totalMinor`.
 * Zero/empty weights fall back to an equal split.
 */
export function splitMinorUnits(totalMinor: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new RangeError("Total must be a non-negative integer of minor units.")
  }
  if (weights.length === 0) return []
  const usable = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0))
  const totalWeight = usable.reduce((sum, weight) => sum + weight, 0)
  const effective = totalWeight > 0 ? usable : weights.map(() => 1)
  const effectiveTotal = effective.reduce((sum, weight) => sum + weight, 0)
  const exact = effective.map((weight) => (totalMinor * weight) / effectiveTotal)
  const parts = exact.map((value) => Math.floor(value))
  let remainder = totalMinor - parts.reduce((sum, part) => sum + part, 0)
  const order = exact
    .map((value, index) => ({ fraction: value - Math.floor(value), index }))
    .toSorted((left, right) => right.fraction - left.fraction || left.index - right.index)
  for (const { index } of order) {
    if (remainder <= 0) break
    const current = parts[index]
    if (current === undefined) continue
    parts[index] = current + 1
    remainder -= 1
  }
  return parts
}

/** Splits monthly income into [needs, wants, savings] minor units. */
export function bucketTotals(
  incomeMinor: number,
  needsPct: number,
  wantsPct: number,
  savingsPct: number,
): [number, number, number] {
  if (needsPct + wantsPct + savingsPct !== 100) {
    throw new RangeError("Template ratios must sum to 100.")
  }
  const [needs, wants, savings] = splitMinorUnits(incomeMinor, [needsPct, wantsPct, savingsPct])
  return [needs ?? 0, wants ?? 0, savings ?? 0]
}

/**
 * Collects per-category historic spend weights from expense transactions
 * (negative normalized amounts). Transactions without a category accumulate
 * under the "Everything else" bucket so they are never dropped. Sorted by
 * category name for deterministic output.
 */
export function collectExpenseWeights(transactions: readonly Transaction[]): CategoryWeight[] {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    const signed = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (signed >= 0) continue
    const name = transaction.category?.trim() || EVERYTHING_ELSE_CATEGORY
    totals.set(name, (totals.get(name) ?? 0) + Math.abs(signed))
  }
  return [...totals.entries()]
    .map(([category, spendMinor]) => ({ category, spendMinor }))
    .toSorted((left, right) => left.category.localeCompare(right.category))
}

function normalizeKey(category: string): string {
  return category.trim().toLocaleLowerCase()
}

export interface PlanTemplateGoalsInput {
  incomeMinor: number
  needsPct: number
  wantsPct: number
  savingsPct: number
  period: BudgetGoal["period"]
  weights: readonly CategoryWeight[]
}

/**
 * Plans per-category goals for one template application.
 *
 * - The needs+wants pool is distributed across the caller's expense categories
 *   proportionally to historic spend (the user's own categories, so output
 *   maps onto what already exists).
 * - The savings share becomes a single "Savings" goal. Expense weights already
 *   named "Savings" are excluded from the spending pool so the plan never
 *   contains two goals for one category.
 * - With no expense categories, the three bucket totals become "Needs",
 *   "Wants", and "Savings" goals directly.
 * - Yearly goals are the monthly amounts times 12. Zero-amount goals are
 *   omitted. The planned amounts always sum to incomeMinor (times 12 yearly).
 */
export function planTemplateGoals(input: PlanTemplateGoalsInput): PlannedGoal[] {
  const { incomeMinor, needsPct, wantsPct, savingsPct, period, weights } = input
  if (!Number.isInteger(incomeMinor) || incomeMinor <= 0) {
    throw new RangeError("Monthly income must be a positive integer of minor units.")
  }
  const [needsMinor, wantsMinor, savingsMinor] = bucketTotals(
    incomeMinor,
    needsPct,
    wantsPct,
    savingsPct,
  )
  const factor = period === "yearly" ? 12 : 1

  if (weights.length === 0) {
    const fallback: Array<{ category: string; amount: number; bucket: PlannedGoalBucket }> = [
      { category: NEEDS_CATEGORY, amount: needsMinor, bucket: "needs" },
      { category: WANTS_CATEGORY, amount: wantsMinor, bucket: "wants" },
      { category: SAVINGS_CATEGORY, amount: savingsMinor, bucket: "savings" },
    ]
    return fallback
      .filter((goal) => goal.amount > 0)
      .map((goal) => ({
        category: goal.category,
        amountMinor: goal.amount * factor,
        period,
        bucket: goal.bucket,
      }))
      .toSorted((left, right) => left.category.localeCompare(right.category))
  }

  const spendWeights = weights.filter(
    (weight) => normalizeKey(weight.category) !== normalizeKey(SAVINGS_CATEGORY),
  )
  const spendPool = needsMinor + wantsMinor
  const shares = splitMinorUnits(
    spendPool,
    spendWeights.map((weight) => weight.spendMinor),
  )
  const goals: PlannedGoal[] = spendWeights.flatMap((weight, index) => {
    const share = shares[index] ?? 0
    if (share <= 0) return []
    return [
      {
        category: weight.category,
        amountMinor: share * factor,
        period,
        bucket: "spending" as const,
      },
    ]
  })
  if (savingsMinor > 0) {
    goals.push({
      category: SAVINGS_CATEGORY,
      amountMinor: savingsMinor * factor,
      period,
      bucket: "savings",
    })
  }
  return goals.toSorted((left, right) => left.category.localeCompare(right.category))
}

export interface TemplatePartition {
  create: PlannedGoal[]
  skipped: PlannedGoal[]
}

/**
 * Splits a plan into goals to create vs. categories that already have a goal
 * for the period. Matching is case-insensitive on the trimmed category, so
 * reapplying a template is idempotent per category+period: every planned goal
 * lands in `skipped` and nothing is duplicated.
 */
export function partitionByExisting(
  planned: readonly PlannedGoal[],
  existing: readonly Pick<BudgetGoal, "category" | "period">[],
  period: BudgetGoal["period"],
): TemplatePartition {
  const taken = new Set(
    existing.filter((goal) => goal.period === period).map((goal) => normalizeKey(goal.category)),
  )
  const create: PlannedGoal[] = []
  const skipped: PlannedGoal[] = []
  for (const goal of planned) {
    if (taken.has(normalizeKey(goal.category))) skipped.push(goal)
    else {
      create.push(goal)
      taken.add(normalizeKey(goal.category))
    }
  }
  return { create, skipped }
}

/**
 * Detects a monthly income baseline from income transactions (positive
 * normalized amounts): total income grouped by calendar month (YYYY-MM), then
 * averaged across the months that have income. Returns null when there is no
 * income history. Callers offer the average as a prefill, never auto-apply.
 */
export function detectMonthlyIncomeAverage(
  transactions: readonly Transaction[],
): DetectedIncome | null {
  const byMonth = new Map<string, number>()
  for (const transaction of transactions) {
    const signed = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (signed <= 0) continue
    const month = transaction.date.slice(0, 7)
    if (!MONTH_PATTERN.test(month)) continue
    byMonth.set(month, (byMonth.get(month) ?? 0) + signed)
  }
  if (byMonth.size === 0) return null
  const totalMinor = [...byMonth.values()].reduce((sum, amount) => sum + amount, 0)
  return {
    averageMinor: Math.round(totalMinor / byMonth.size),
    monthCount: byMonth.size,
    totalMinor,
  }
}
