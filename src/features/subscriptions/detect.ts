import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export const SUBSCRIPTION_MIN_OCCURRENCES = 3
export const SUBSCRIPTION_INTERVAL_TOLERANCE = 0.25
export const SUBSCRIPTION_MIN_INTERVAL_DAYS = 7
const DAYS_PER_MONTH = 30.4375

export type SubscriptionCadence = "biweekly" | "monthly" | "quarterly" | "recurring"

export interface SubscriptionSummary {
  key: string
  displayName: string
  occurrences: number
  medianIntervalDays: number
  medianAmountMinor: number
  monthlyBurnMinor: number
  lastDate: string
  cadence: SubscriptionCadence
}

export interface SubscriptionResult {
  subscriptions: SubscriptionSummary[]
  totalMonthlyBurnMinor: number
}

export function normalizeMerchant(description: string): string {
  return description
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function median(values: readonly number[]): number {
  const sorted = [...values].toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function withinTolerance(value: number, target: number): boolean {
  if (target <= 0) return false
  return Math.abs(value - target) / target <= SUBSCRIPTION_INTERVAL_TOLERANCE + 1e-9
}

function parseIsoDateMs(date: string): number | null {
  const time = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(time) ? null : time
}

function classifyCadence(medianIntervalDays: number): SubscriptionCadence {
  if (medianIntervalDays <= 20) return "biweekly"
  if (medianIntervalDays <= 45) return "monthly"
  if (medianIntervalDays <= 120) return "quarterly"
  return "recurring"
}

interface GroupedMerchant {
  key: string
  displayName: string
  amountsByDate: Map<string, number>
}

export function detectSubscriptions(transactions: readonly Transaction[]): SubscriptionResult {
  const groups = new Map<string, GroupedMerchant>()
  const nameCounts = new Map<string, Map<string, number>>()

  for (const transaction of transactions) {
    const key = normalizeMerchant(transaction.description)
    if (!key) continue
    const signed = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (signed >= 0) continue
    const amount = Math.abs(signed)
    const time = parseIsoDateMs(transaction.date)
    if (time === null) continue

    let group = groups.get(key)
    if (!group) {
      group = { key, displayName: transaction.description.trim(), amountsByDate: new Map() }
      groups.set(key, group)
      nameCounts.set(key, new Map())
    }
    const trimmed = transaction.description.trim()
    const counts = nameCounts.get(key)
    if (counts && trimmed) counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
    group.amountsByDate.set(
      transaction.date,
      (group.amountsByDate.get(transaction.date) ?? 0) + amount,
    )
  }

  const subscriptions: SubscriptionSummary[] = []

  for (const group of groups.values()) {
    const dates = [...group.amountsByDate.keys()].toSorted()
    if (dates.length < SUBSCRIPTION_MIN_OCCURRENCES) continue

    const times = dates
      .map((date) => parseIsoDateMs(date))
      .filter((time): time is number => time !== null)
    if (times.length !== dates.length) continue

    const intervals: number[] = []
    for (let index = 1; index < times.length; index += 1) {
      intervals.push((times[index]! - times[index - 1]!) / 86_400_000)
    }
    if (intervals.some((interval) => interval <= 0)) continue

    const base = intervals.length === 2 ? Math.min(...intervals) : median(intervals)
    if (base < SUBSCRIPTION_MIN_INTERVAL_DAYS) continue

    let doubled = 0
    let regular = true
    for (const interval of intervals) {
      if (withinTolerance(interval, base)) continue
      if (withinTolerance(interval, base * 2)) {
        doubled += 1
        if (doubled > 1) {
          regular = false
          break
        }
        continue
      }
      regular = false
      break
    }
    if (!regular) continue

    const amounts = [...group.amountsByDate.values()].toSorted((left, right) => left - right)
    const medianAmount = Math.round(median(amounts))
    if (medianAmount <= 0) continue
    const monthlyBurnMinor = Math.round((medianAmount * DAYS_PER_MONTH) / base)
    const counts = nameCounts.get(group.key)
    let displayName = group.displayName
    let bestCount = -1
    if (counts) {
      for (const [name, count] of counts) {
        if (count > bestCount) {
          bestCount = count
          displayName = name
        }
      }
    }

    subscriptions.push({
      key: group.key,
      displayName,
      occurrences: dates.length,
      medianIntervalDays: Math.round(base * 10) / 10,
      medianAmountMinor: medianAmount,
      monthlyBurnMinor,
      lastDate: dates.at(-1) ?? "",
      cadence: classifyCadence(base),
    })
  }

  subscriptions.sort(
    (left, right) =>
      right.monthlyBurnMinor - left.monthlyBurnMinor ||
      left.displayName.localeCompare(right.displayName),
  )

  return {
    subscriptions,
    totalMonthlyBurnMinor: subscriptions.reduce(
      (sum, subscription) => sum + subscription.monthlyBurnMinor,
      0,
    ),
  }
}
