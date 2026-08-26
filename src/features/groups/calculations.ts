import type { Transaction, TransactionGroup } from "@/domain/models"
import { effectiveTransactionAmountMinor } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { formatMoney } from "@/features/dashboard/format"

export interface GroupCategorySlice {
  category: string
  amountMinor: number
  share: number
}

export interface GroupDayPoint {
  date: string
  spendMinor: number
  cumulativeMinor: number
}

export interface GroupSummary {
  memberCount: number
  sharedCount: number
  /** Total normalized expense amounts before any split. */
  grossExpenseMinor: number
  /** Expenses after applying shared splits — "your" cost. */
  effectiveExpenseMinor: number
  /** How much sharing saved: gross − effective. */
  savedBySharingMinor: number
  /** Refunds/credits inside the group after splits. */
  refundMinor: number
  /** Effective expenses net of refunds. */
  netCostMinor: number
  budgetMinor: number | null
  byCategory: GroupCategorySlice[]
  byDay: GroupDayPoint[]
  topExpenses: Transaction[]
}

/**
 * The transaction's contribution to a group in minor units. Shared expenses
 * count at their divided rate; refunds/credits are positive.
 */
export function groupContributionMinor(transaction: Transaction): number {
  const normalized = normalizeTransactionAmountMinor(
    transaction.amountMinor,
    transaction.transactionType,
  )
  return effectiveTransactionAmountMinor(normalized, transaction.shared, transaction.shareCount)
}

function windowBounds(group: TransactionGroup, members: readonly Transaction[]) {
  if (group.startDate && group.endDate && group.startDate <= group.endDate) {
    return { start: group.startDate, end: group.endDate }
  }
  const dates = members.map((member) => member.date)
  return dates.length ? { start: dates.toSorted()[0], end: dates.toSorted().at(-1) } : null
}

export function calculateGroupSummary(
  group: TransactionGroup,
  members: readonly Transaction[],
): GroupSummary {
  let grossExpenseMinor = 0
  let effectiveExpenseMinor = 0
  let refundMinor = 0
  let sharedCount = 0
  const byCategoryMap = new Map<string, number>()
  const dailySpend = new Map<string, number>()

  for (const member of members) {
    const raw = normalizeTransactionAmountMinor(member.amountMinor, member.transactionType)
    const effective = groupContributionMinor(member)
    if (member.shared) sharedCount += 1

    if (raw < 0) {
      grossExpenseMinor += -raw
      effectiveExpenseMinor += -effective
      if (effective < 0) {
        byCategoryMap.set(
          member.category ?? "Uncategorized",
          (byCategoryMap.get(member.category ?? "Uncategorized") ?? 0) + -effective,
        )
        dailySpend.set(member.date, (dailySpend.get(member.date) ?? 0) + -effective)
      }
    } else {
      refundMinor += effective
    }
  }

  const bounds = windowBounds(group, members)
  const byDay: GroupDayPoint[] = []
  if (bounds) {
    let cumulative = 0
    const cursor = new Date(`${bounds.start}T00:00:00Z`)
    const end = new Date(`${bounds.end}T00:00:00Z`)
    for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10)
      cumulative += dailySpend.get(date) ?? 0
      if (dailySpend.has(date))
        byDay.push({ date, spendMinor: dailySpend.get(date) ?? 0, cumulativeMinor: cumulative })
    }
  }

  const byCategory: GroupCategorySlice[] = [...byCategoryMap.entries()]
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .toSorted((left, right) => right.amountMinor - left.amountMinor)
    .map((slice) => ({
      ...slice,
      share: effectiveExpenseMinor > 0 ? slice.amountMinor / effectiveExpenseMinor : 0,
    }))

  const topExpenses = members
    .filter(
      (member) => normalizeTransactionAmountMinor(member.amountMinor, member.transactionType) < 0,
    )
    .toSorted(
      (left, right) =>
        normalizeTransactionAmountMinor(left.amountMinor, left.transactionType) -
        normalizeTransactionAmountMinor(right.amountMinor, right.transactionType),
    )
    .slice(0, 5)

  return {
    memberCount: members.length,
    sharedCount,
    grossExpenseMinor,
    effectiveExpenseMinor,
    savedBySharingMinor: grossExpenseMinor - effectiveExpenseMinor,
    refundMinor,
    netCostMinor: effectiveExpenseMinor - refundMinor,
    budgetMinor: group.budgetMinor,
    byCategory,
    byDay,
    topExpenses,
  }
}

/** One-line summary used on cards and badges. */
export function summarizeGroupCost(summary: GroupSummary): string {
  return `${formatMoney(summary.netCostMinor)} net`
}

export function groupFormValues(input: {
  name: string
  budget: string
  startDate: string
  endDate: string
  color: string
}): Pick<TransactionGroup, "name" | "budgetMinor" | "startDate" | "endDate" | "color"> | null {
  const name = input.name.trim()
  if (!name || name.length > 100) return null

  const isoDate = (value: string): string | null =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null

  const startDate = input.startDate ? isoDate(input.startDate) : null
  const endDate = input.endDate ? isoDate(input.endDate) : null
  if (input.startDate && !startDate) return null
  if (input.endDate && !endDate) return null
  if (startDate && endDate && startDate > endDate) return null

  let budgetMinor: number | null = null
  if (input.budget.trim()) {
    const numeric = Number(input.budget)
    if (!Number.isFinite(numeric) || numeric <= 0) return null
    budgetMinor = Math.round(numeric * 100)
  }

  return { name, budgetMinor, startDate, endDate, color: input.color as TransactionGroup["color"] }
}

export function parseShareCount(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 10) return null
  return parsed
}
