import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { detectSubscriptions, normalizeMerchant } from "@/features/subscriptions/detect"

// Month-over-month digest engine.
//
// Note on reuse: `summarizeVariance` in `features/assistant/data-tools`
// aggregates trailing-3-months vs the prior 3 months into a human-readable
// string. This digest needs calendar-month scoping (current vs previous
// `YYYY-MM`), per-category percentages, and structured link targets for the
// transactions view, so it computes month-scoped aggregates locally instead.
// Recurring detection (`detectSubscriptions` + `normalizeMerchant`) is reused
// read-only for dead-subscription signals.

export const INSIGHTS_MAX_MOVERS_UP = 3
export const INSIGHTS_MAX_MOVERS_DOWN = 3
export const INSIGHTS_MAX_NEW_MERCHANTS = 4
export const INSIGHTS_MAX_DEAD_SUBSCRIPTIONS = 4

export type InsightKind = "mover-up" | "mover-down" | "new-merchant" | "dead-subscription"

export interface CategoryMover {
  category: string
  currentMinor: number
  previousMinor: number
  deltaMinor: number
  /** Null when the previous month total is zero (division by zero). */
  percent: number | null
  direction: "up" | "down"
}

export interface NewMerchant {
  key: string
  displayName: string
  totalMinor: number
  count: number
}

export interface DeadSubscription {
  key: string
  displayName: string
  lastDate: string
  lastAmountMinor: number
}

export interface InsightLink {
  from: string
  to: string
  category?: string
  merchant?: string
}

export interface Insight {
  id: string
  kind: InsightKind
  title: string
  mover?: CategoryMover
  newMerchant?: NewMerchant
  deadSubscription?: DeadSubscription
  link: InsightLink
}

export interface InsightsDigest {
  currentMonth: string | null
  previousMonth: string | null
  currentFrom: string | null
  currentTo: string | null
  previousFrom: string | null
  previousTo: string | null
  monthCount: number
  hasEnoughHistory: boolean
  digestKey: string | null
  moversUp: CategoryMover[]
  moversDown: CategoryMover[]
  newMerchants: NewMerchant[]
  deadSubscriptions: DeadSubscription[]
  insights: Insight[]
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/

function monthOf(date: string): string | null {
  const month = date.slice(0, 7)
  if (!MONTH_PATTERN.test(month)) return null
  const monthNumber = Number(month.slice(5, 7))
  if (monthNumber < 1 || monthNumber > 12) return null
  return month
}

export function monthRange(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const from = `${month}-01`
  // Day zero of the next month is the last day of this month (UTC).
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from, to: `${month}-${String(lastDay).padStart(2, "0")}` }
}

function expenseMinor(transaction: Transaction): number {
  const signed = normalizeTransactionAmountMinor(
    transaction.amountMinor,
    transaction.transactionType,
  )
  return signed < 0 ? Math.abs(signed) : 0
}

function categoryOf(transaction: Transaction): string {
  const trimmed = transaction.category?.trim()
  return trimmed ? trimmed : "Uncategorized"
}

function slugOf(value: string): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "item"
}

/** Shared percent label so unit tests, the card, and browser specs agree. */
export function formatInsightsPercent(percent: number | null): string {
  if (percent === null) return "new"
  const sign = percent >= 0 ? "+" : ""
  return `${sign}${(percent * 100).toFixed(1)}%`
}

function distinctMonths(transactions: readonly Transaction[]): string[] {
  const months = new Set<string>()
  for (const transaction of transactions) {
    const month = monthOf(transaction.date)
    if (month) months.add(month)
  }
  return [...months].toSorted()
}

function categoryTotals(transactions: readonly Transaction[], month: string): Map<string, number> {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    if (monthOf(transaction.date) !== month) continue
    const amount = expenseMinor(transaction)
    if (amount <= 0) continue
    const category = categoryOf(transaction)
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }
  return totals
}

function buildMovers(
  transactions: readonly Transaction[],
  currentMonth: string,
  previousMonth: string,
): { up: CategoryMover[]; down: CategoryMover[] } {
  const current = categoryTotals(transactions, currentMonth)
  const previous = categoryTotals(transactions, previousMonth)
  const categories = new Set([...current.keys(), ...previous.keys()])
  const all: CategoryMover[] = []
  for (const category of categories) {
    const currentMinor = current.get(category) ?? 0
    const previousMinor = previous.get(category) ?? 0
    const deltaMinor = currentMinor - previousMinor
    if (deltaMinor === 0) continue
    all.push({
      category,
      currentMinor,
      previousMinor,
      deltaMinor,
      percent: previousMinor === 0 ? null : deltaMinor / previousMinor,
      direction: deltaMinor > 0 ? "up" : "down",
    })
  }
  const up = all
    .filter((mover) => mover.direction === "up")
    .toSorted(
      (left, right) =>
        right.deltaMinor - left.deltaMinor || left.category.localeCompare(right.category),
    )
    .slice(0, INSIGHTS_MAX_MOVERS_UP)
  const down = all
    .filter((mover) => mover.direction === "down")
    .toSorted(
      (left, right) =>
        left.deltaMinor - right.deltaMinor || left.category.localeCompare(right.category),
    )
    .slice(0, INSIGHTS_MAX_MOVERS_DOWN)
  return { up, down }
}

interface MerchantAggregate {
  key: string
  displayName: string
  totalMinor: number
  count: number
}

function merchantAggregates(
  transactions: readonly Transaction[],
  predicate: (transaction: Transaction) => boolean,
): Map<string, MerchantAggregate> {
  const groups = new Map<
    string,
    { counts: Map<string, number>; totalMinor: number; count: number }
  >()
  for (const transaction of transactions) {
    if (!predicate(transaction)) continue
    const amount = expenseMinor(transaction)
    if (amount <= 0) continue
    const key = normalizeMerchant(transaction.description)
    if (!key) continue
    let group = groups.get(key)
    if (!group) {
      group = { counts: new Map(), totalMinor: 0, count: 0 }
      groups.set(key, group)
    }
    const trimmed = transaction.description.trim()
    if (trimmed) group.counts.set(trimmed, (group.counts.get(trimmed) ?? 0) + 1)
    group.totalMinor += amount
    group.count += 1
  }
  const result = new Map<string, MerchantAggregate>()
  for (const [key, group] of groups) {
    let displayName = key
    let best = -1
    for (const [name, count] of group.counts) {
      if (count > best) {
        best = count
        displayName = name
      }
    }
    result.set(key, { key, displayName, totalMinor: group.totalMinor, count: group.count })
  }
  return result
}

function buildNewMerchants(
  transactions: readonly Transaction[],
  currentMonth: string,
): NewMerchant[] {
  const current = merchantAggregates(
    transactions,
    (transaction) => monthOf(transaction.date) === currentMonth,
  )
  const priorKeys = new Set<string>()
  for (const transaction of transactions) {
    const month = monthOf(transaction.date)
    if (!month || month >= currentMonth) continue
    const amount = expenseMinor(transaction)
    if (amount <= 0) continue
    const key = normalizeMerchant(transaction.description)
    if (key) priorKeys.add(key)
  }
  return [...current.values()]
    .filter((entry) => !priorKeys.has(entry.key))
    .toSorted(
      (left, right) =>
        right.totalMinor - left.totalMinor || left.displayName.localeCompare(right.displayName),
    )
    .slice(0, INSIGHTS_MAX_NEW_MERCHANTS)
    .map((entry) => ({
      key: entry.key,
      displayName: entry.displayName,
      totalMinor: entry.totalMinor,
      count: entry.count,
    }))
}

function lastExpenseByMerchant(
  transactions: readonly Transaction[],
  key: string,
): { date: string; amountMinor: number } | null {
  let last: { date: string; amountMinor: number } | null = null
  for (const transaction of transactions) {
    if (normalizeMerchant(transaction.description) !== key) continue
    const amount = expenseMinor(transaction)
    if (amount <= 0) continue
    if (!last || transaction.date > last.date) {
      last = { date: transaction.date, amountMinor: amount }
    }
  }
  return last
}

function buildDeadSubscriptions(
  transactions: readonly Transaction[],
  currentMonth: string,
  previousMonth: string,
): DeadSubscription[] {
  const currentKeys = new Set(
    merchantAggregates(transactions, (t) => monthOf(t.date) === currentMonth).keys(),
  )
  const displayByKey = new Map<string, string>()
  for (const aggregate of merchantAggregates(transactions, () => true).values()) {
    displayByKey.set(aggregate.key, aggregate.displayName)
  }

  // Preferred signal: recurring merchants detected from full history that
  // have no charge in the current month (read-only reuse).
  let detected: DeadSubscription[] = []
  try {
    const { subscriptions } = detectSubscriptions(transactions)
    if (subscriptions.length > 0) {
      detected = subscriptions
        .filter((subscription) => {
          if (currentKeys.has(subscription.key)) return false
          return monthOf(subscription.lastDate) !== currentMonth
        })
        .map((subscription) => ({
          key: subscription.key,
          displayName: subscription.displayName,
          lastDate: subscription.lastDate,
          lastAmountMinor: subscription.medianAmountMinor,
        }))
        .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
        .slice(0, INSIGHTS_MAX_DEAD_SUBSCRIPTIONS)
      return detected
    }
  } catch {
    // Fall through to the simple prior-month comparison below.
  }

  // Fallback: merchants charged in the previous month with nothing in the
  // current month. Every figure stays cited from the two monthly aggregates.
  const previous = merchantAggregates(
    transactions,
    (transaction) => monthOf(transaction.date) === previousMonth,
  )
  return [...previous.values()]
    .filter((entry) => !currentKeys.has(entry.key))
    .map((entry) => {
      const last = lastExpenseByMerchant(transactions, entry.key)
      return {
        key: entry.key,
        displayName: displayByKey.get(entry.key) ?? entry.displayName,
        lastDate: last?.date ?? `${previousMonth}-01`,
        lastAmountMinor: last?.amountMinor ?? entry.totalMinor,
      }
    })
    .toSorted((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, INSIGHTS_MAX_DEAD_SUBSCRIPTIONS)
}

export function buildInsightsDigest(transactions: readonly Transaction[]): InsightsDigest {
  const months = distinctMonths(transactions)
  const currentMonth = months.at(-1) ?? null
  const previousMonth = months.at(-2) ?? null
  const hasEnoughHistory = currentMonth !== null && previousMonth !== null
  if (!hasEnoughHistory || !currentMonth || !previousMonth) {
    return {
      currentMonth,
      previousMonth,
      currentFrom: null,
      currentTo: null,
      previousFrom: null,
      previousTo: null,
      monthCount: months.length,
      hasEnoughHistory: false,
      digestKey: null,
      moversUp: [],
      moversDown: [],
      newMerchants: [],
      deadSubscriptions: [],
      insights: [],
    }
  }

  const current = monthRange(currentMonth)
  const previous = monthRange(previousMonth)
  const digestKey = `${previousMonth}>${currentMonth}`
  const { up, down } = buildMovers(transactions, currentMonth, previousMonth)
  const newMerchants = buildNewMerchants(transactions, currentMonth)
  const deadSubscriptions = buildDeadSubscriptions(transactions, currentMonth, previousMonth)

  const insights: Insight[] = []
  for (const mover of up) {
    insights.push({
      id: `${digestKey}|mover-up|${slugOf(mover.category)}`,
      kind: "mover-up",
      title: mover.category,
      mover,
      link: { category: mover.category, from: current.from, to: current.to },
    })
  }
  for (const mover of down) {
    insights.push({
      id: `${digestKey}|mover-down|${slugOf(mover.category)}`,
      kind: "mover-down",
      title: mover.category,
      mover,
      link: { category: mover.category, from: current.from, to: current.to },
    })
  }
  for (const merchant of newMerchants) {
    insights.push({
      id: `${digestKey}|new-merchant|${slugOf(merchant.key)}`,
      kind: "new-merchant",
      title: merchant.displayName,
      newMerchant: merchant,
      link: { merchant: merchant.displayName, from: current.from, to: current.to },
    })
  }
  for (const dead of deadSubscriptions) {
    insights.push({
      id: `${digestKey}|dead-subscription|${slugOf(dead.key)}`,
      kind: "dead-subscription",
      title: dead.displayName,
      deadSubscription: dead,
      link: { merchant: dead.displayName, from: previous.from, to: previous.to },
    })
  }

  return {
    currentMonth,
    previousMonth,
    currentFrom: current.from,
    currentTo: current.to,
    previousFrom: previous.from,
    previousTo: previous.to,
    monthCount: months.length,
    hasEnoughHistory: true,
    digestKey,
    moversUp: up,
    moversDown: down,
    newMerchants,
    deadSubscriptions,
    insights,
  }
}
