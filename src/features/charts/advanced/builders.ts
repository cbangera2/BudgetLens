import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { calculateMetrics } from "@/features/dashboard/calculations"

export interface StackedCategoryRow {
  id: string
  month: string
  category: string
  amount: number
}

export interface WaterfallNode {
  label: string
  start: number
  end: number
  kind: "increase" | "decrease" | "total"
}

export interface RadarPoint {
  id: string
  category: string
  share: number
}

export interface HeatmapCell {
  id: string
  week: string
  weekday: string
  day: string
  amount: number
  level: string
}

export interface GaugeReading {
  rate: number
  income: number
  savings: number
}

export interface TreemapRow {
  name: string
  size: number
}

export interface LollipopRow {
  id: string
  category: string
  amount: number
  label: string
}

export const HEATMAP_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export const HEATMAP_LEVELS = ["None", "Low", "Medium", "High", "Peak"] as const

function expenseMinor(transaction: Transaction): number {
  const amountMinor = normalizeTransactionAmountMinor(
    transaction.amountMinor,
    transaction.transactionType,
  )
  return amountMinor < 0 ? Math.abs(amountMinor) : 0
}

function mondayOf(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  const offset = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - offset)
  return day.toISOString().slice(0, 10)
}

function weekdayOf(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number)
  return HEATMAP_WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7] ?? "Mon"
}

function weekLabel(monday: string): string {
  const [y = 0, m = 1, d = 1] = monday.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/**
 * Monthly expense stacks for the top five categories plus an "Other" rollup.
 * Only positive month/category cells become rows; the stack mark imputes the
 * rest as zero without synthetic interaction points.
 */
export function buildStackedCategoryRows(
  transactions: readonly Transaction[],
  topCount = 5,
): { rows: StackedCategoryRow[]; categories: string[] } {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    const amount = expenseMinor(transaction)
    if (amount === 0) continue
    const category = transaction.category?.trim() || "Uncategorized"
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }
  const ranked = [...totals.entries()].toSorted(([, left], [, right]) => right - left)
  const top = new Set(ranked.slice(0, topCount).map(([category]) => category))
  const categories = [...top, ...(ranked.length > topCount ? ["Other"] : [])]

  const cells = new Map<string, number>()
  for (const transaction of transactions) {
    const amount = expenseMinor(transaction)
    if (amount === 0) continue
    const raw = transaction.category?.trim() || "Uncategorized"
    const category = top.has(raw) ? raw : "Other"
    const month = transaction.date.slice(0, 7)
    const key = `${month}	${category}`
    cells.set(key, (cells.get(key) ?? 0) + amount)
  }

  const rows: StackedCategoryRow[] = [...cells.entries()]
    .filter(([, amountMinor]) => amountMinor > 0)
    .map(([key, amountMinor]) => {
      const [month = "", category = "Other"] = key.split("	")
      return { id: `${month}:${category}`, month, category, amount: amountMinor / 100 }
    })
    .toSorted(
      (left, right) =>
        left.month.localeCompare(right.month) ||
        categories.indexOf(left.category) - categories.indexOf(right.category),
    )
  return { rows, categories }
}

/**
 * Single-period cash-flow bridge: income adds, expenses subtract, savings is
 * the resulting total. Endpoints are explicit so the renderer never guesses
 * which rows are deltas and which are totals.
 */
export function buildWaterfallNodes(transactions: readonly Transaction[]): WaterfallNode[] {
  const totals = calculateMetrics(transactions)
  if (totals.transactionCount === 0) return []
  const income = totals.incomeMinor / 100
  const expenses = totals.expenseMinor / 100
  const savings = totals.savingsMinor / 100
  return [
    { label: "Income", start: 0, end: income, kind: "increase" },
    { label: "Expenses", start: income, end: income - expenses, kind: "decrease" },
    { label: "Savings", start: 0, end: savings, kind: "total" },
  ]
}

/**
 * Top-category spending profile scaled against the largest category, closed
 * into a polygon by repeating the first observation with a unique id.
 */
export function buildRadarProfile(
  transactions: readonly Transaction[],
  topCount = 6,
): { points: RadarPoint[]; maximum: number } {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    const amount = expenseMinor(transaction)
    if (amount === 0) continue
    const category = transaction.category?.trim() || "Uncategorized"
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }
  const ranked = [...totals.entries()]
    .toSorted(([, left], [, right]) => right - left)
    .slice(0, topCount)
  if (ranked.length < 3) return { points: [], maximum: 0 }
  const maximum = ranked[0]?.[1] ?? 0
  if (maximum === 0) return { points: [], maximum: 0 }
  const open: RadarPoint[] = ranked.map(([category, amountMinor]) => ({
    id: category,
    category,
    share: amountMinor / maximum,
  }))
  const first = open[0]
  const points = first ? [...open, { ...first, id: `${first.category}:close` }] : open
  return { points, maximum: maximum / 100 }
}

/**
 * Weekday-by-week expense matrix for the heatmap. Levels are quintile buckets
 * over nonzero daily totals so the color ramp always spans the observed range.
 */
export function buildHeatmapCells(transactions: readonly Transaction[]): {
  cells: HeatmapCell[]
  weeks: string[]
} {
  const byDay = new Map<string, number>()
  for (const transaction of transactions) {
    const amount = expenseMinor(transaction)
    if (amount === 0) continue
    byDay.set(transaction.date, (byDay.get(transaction.date) ?? 0) + amount)
  }
  if (byDay.size === 0) return { cells: [], weeks: [] }

  const sorted = [...byDay.values()].toSorted((left, right) => left - right)
  const quantile = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  const [q1, q2, q3] = [quantile(0.25), quantile(0.5), quantile(0.75)]
  const levelFor = (amountMinor: number): string =>
    amountMinor <= q1 ? "Low" : amountMinor <= q2 ? "Medium" : amountMinor <= q3 ? "High" : "Peak"

  const mondays = [...new Set([...byDay.keys()].map(mondayOf))].toSorted()
  const weekNames = new Map(mondays.map((monday) => [monday, `w/c ${weekLabel(monday)}`]))
  const cells: HeatmapCell[] = [...byDay.entries()]
    .map(([day, amountMinor]) => {
      const monday = mondayOf(day)
      return {
        id: day,
        week: weekNames.get(monday) ?? monday,
        weekday: weekdayOf(day),
        day,
        amount: amountMinor / 100,
        level: levelFor(amountMinor),
      }
    })
    // Date order keeps the inferred week domain chronological.
    .toSorted((left, right) => left.day.localeCompare(right.day))
  return { cells, weeks: mondays.map((monday) => weekNames.get(monday) ?? monday) }
}

/** Savings-rate gauge reading, or null without income to measure against. */
export function buildSavingsGauge(transactions: readonly Transaction[]): GaugeReading | null {
  const totals = calculateMetrics(transactions)
  if (totals.incomeMinor <= 0) return null
  return {
    rate: Math.max(0, Math.min(1, totals.savingsMinor / totals.incomeMinor)),
    income: totals.incomeMinor / 100,
    savings: totals.savingsMinor / 100,
  }
}

/**
 * Single-level spending hierarchy ("Spending/<category>") for the treemap.
 * Ancestors are imputed by the mark; order is largest-first.
 */
export function buildTreemapRows(
  transactions: readonly Transaction[],
  topCount = 12,
): { rows: TreemapRow[]; categories: string[] } {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    const amount = expenseMinor(transaction)
    if (amount === 0) continue
    const category = transaction.category?.trim() || "Uncategorized"
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }
  const ranked = [...totals.entries()]
    .toSorted(([, left], [, right]) => right - left)
    .slice(0, topCount)
  return {
    rows: ranked.map(([category, amountMinor]) => ({
      name: `Spending/${category}`,
      size: amountMinor / 100,
    })),
    categories: ranked.map(([category]) => category),
  }
}

function moneyWhole(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

/** Top categories ranked for the lollipop chart, largest first. */
export function buildLollipopRows(
  transactions: readonly Transaction[],
  topCount = 8,
): LollipopRow[] {
  const totals = new Map<string, number>()
  for (const transaction of transactions) {
    const amount = expenseMinor(transaction)
    if (amount === 0) continue
    const category = transaction.category?.trim() || "Uncategorized"
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }
  return [...totals.entries()]
    .toSorted(([, left], [, right]) => right - left)
    .slice(0, topCount)
    .map(([category, amountMinor]) => ({
      id: category,
      category,
      amount: amountMinor / 100,
      label: moneyWhole(amountMinor / 100),
    }))
}
