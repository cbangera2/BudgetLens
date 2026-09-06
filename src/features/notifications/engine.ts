// On-device reminder derivation engine (pure TypeScript, no platform imports).
//
// Derives local-notification triggers from local data only: monthly category
// budget threshold crossings (50/80/100%) and recurring-merchant bill
// reminders (predicted charge within the upcoming window). No server, no
// account, no side effects — the scheduling layer in scheduler.ts turns these
// into @capacitor/local-notifications calls on native and no-ops on web.
//
// Recurring-merchant detection here is intentionally self-contained (it does
// not import the subscriptions feature) so the notifications feature stays
// independent of sibling agents' zones.

import type { BudgetGoal, Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

/** Budget spend thresholds (percent of the monthly goal) that fire reminders. */
export const BUDGET_THRESHOLD_PERCENTS = [50, 80, 100] as const

/** A recurring bill fires when its predicted charge is this many days out (inclusive). */
export const BILL_UPCOMING_WINDOW_DAYS = 3

/** Minimum charge occurrences before a merchant counts as recurring. */
export const RECURRING_MIN_OCCURRENCES = 3

/** Median cadence below this many days is spending noise, not a bill. */
export const RECURRING_MIN_INTERVAL_DAYS = 7

const INTERVAL_TOLERANCE = 0.25
const MS_PER_DAY = 86_400_000

export type ReminderKind = "budget" | "bill"

export interface PendingReminder {
  /** Stable dedupe key, e.g. "budget:Groceries:2026-09:80". Survives restarts. */
  key: string
  kind: ReminderKind
  title: string
  body: string
}

export interface ReminderInputs {
  budgets: readonly BudgetGoal[]
  transactions: readonly Transaction[]
  /** Local calendar day, YYYY-MM-DD. */
  todayIso: string
  /** Already-fired keys for the current period; matching triggers are skipped. */
  firedKeys?: ReadonlySet<string>
}

export function formatMinorAsMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    amountMinor / 100,
  )
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number)
  if (year === undefined || monthNumber === undefined || monthNumber < 1 || monthNumber > 12)
    return month
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

function isExpense(transaction: Transaction): boolean {
  return normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType) < 0
}

function expenseMinor(transaction: Transaction): number {
  return Math.abs(
    normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType),
  )
}

function spentForCategoryMonth(
  transactions: readonly Transaction[],
  category: string,
  month: string,
): number {
  let spent = 0
  for (const transaction of transactions) {
    if (!isExpense(transaction)) continue
    if (transaction.category !== category) continue
    if (!transaction.date.startsWith(month)) continue
    spent += expenseMinor(transaction)
  }
  return spent
}

/**
 * Highest crossed threshold for this spend/goal pair, or null. Integer math
 * throughout so exact boundaries (e.g. exactly 50%) always fire.
 */
export function crossedThreshold(spentMinor: number, goalMinor: number): number | null {
  if (!Number.isFinite(spentMinor) || !Number.isFinite(goalMinor)) return null
  if (goalMinor <= 0 || spentMinor < 0) return null
  let crossed: number | null = null
  for (const percent of BUDGET_THRESHOLD_PERCENTS) {
    if (spentMinor * 100 >= goalMinor * percent) crossed = percent
  }
  return crossed
}

function budgetReminder(
  category: string,
  month: string,
  percent: number,
  spentMinor: number,
  goalMinor: number,
): PendingReminder {
  const label = monthLabel(month)
  const spent = formatMinorAsMoney(spentMinor)
  const goal = formatMinorAsMoney(goalMinor)
  if (percent >= 100) {
    return {
      key: `budget:${category}:${month}:${percent}`,
      kind: "budget",
      title: `${category} is over budget`,
      body: `${category} hit ${percent}% of its ${label} budget (${spent} of ${goal}).`,
    }
  }
  return {
    key: `budget:${category}:${month}:${percent}`,
    kind: "budget",
    title: `${category} is at ${percent}% of budget`,
    body: `${category} reached ${percent}% of its ${label} budget (${spent} of ${goal}).`,
  }
}

function computeBudgetReminders(
  budgets: readonly BudgetGoal[],
  transactions: readonly Transaction[],
  month: string,
): PendingReminder[] {
  const reminders: PendingReminder[] = []
  for (const goal of budgets) {
    // Yearly goals are out of scope: this feature covers monthly category budgets.
    if (goal.period !== "monthly") continue
    const category = goal.category.trim()
    if (!category || goal.amountMinor <= 0) continue
    const spent = spentForCategoryMonth(transactions, goal.category, month)
    const percent = crossedThreshold(spent, goal.amountMinor)
    if (percent === null) continue
    reminders.push(budgetReminder(category, month, percent, spent, goal.amountMinor))
  }
  return reminders
}

/** Lowercase alphanumeric merchant folding (independent copy; see module header). */
export function normalizeMerchantName(description: string): string {
  return description
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function parseDayMs(day: string): number | null {
  const time = Date.parse(`${day}T00:00:00Z`)
  return Number.isNaN(time) ? null : time
}

function median(values: readonly number[]): number {
  const sorted = [...values].toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function withinTolerance(value: number, target: number): boolean {
  if (target <= 0) return false
  return Math.abs(value - target) / target <= INTERVAL_TOLERANCE + 1e-9
}

interface MerchantSeries {
  key: string
  displayName: string
  /** Total expense per distinct calendar day. */
  amountsByDay: Map<string, number>
}

function groupRecurringCandidates(transactions: readonly Transaction[]): MerchantSeries[] {
  const groups = new Map<string, MerchantSeries>()
  const nameCounts = new Map<string, Map<string, number>>()
  for (const transaction of transactions) {
    if (!isExpense(transaction)) continue
    const key = normalizeMerchantName(transaction.description)
    if (!key) continue
    if (parseDayMs(transaction.date) === null) continue
    let group = groups.get(key)
    if (!group) {
      group = { key, displayName: transaction.description.trim(), amountsByDay: new Map() }
      groups.set(key, group)
      nameCounts.set(key, new Map())
    }
    const trimmed = transaction.description.trim()
    if (trimmed) {
      const counts = nameCounts.get(key)
      if (counts) counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
    }
    group.amountsByDay.set(
      transaction.date,
      (group.amountsByDay.get(transaction.date) ?? 0) + expenseMinor(transaction),
    )
  }
  for (const group of groups.values()) {
    const counts = nameCounts.get(group.key)
    if (!counts) continue
    let best = -1
    for (const [name, count] of counts) {
      if (count > best) {
        best = count
        group.displayName = name
      }
    }
  }
  return [...groups.values()]
}

interface BillPrediction {
  displayName: string
  key: string
  predictedDay: string
  daysUntil: number
  medianAmountMinor: number
}

function predictBill(group: MerchantSeries, todayMs: number): BillPrediction | null {
  const days = [...group.amountsByDay.keys()].toSorted()
  if (days.length < RECURRING_MIN_OCCURRENCES) return null
  const times = days.map((day) => parseDayMs(day))
  const stamps = times.filter((time): time is number => time !== null)
  if (stamps.length !== days.length) return null
  const intervals: number[] = []
  for (let index = 1; index < stamps.length; index += 1) {
    const prev = stamps[index - 1]
    const next = stamps[index]
    if (prev === undefined || next === undefined || next <= prev) return null
    intervals.push((next - prev) / MS_PER_DAY)
  }
  let base = median(intervals)
  if (intervals.length === 2) {
    const short = Math.min(...intervals)
    const long = Math.max(...intervals)
    base = withinTolerance(long, short * 2) ? short : median(intervals)
  }
  if (!(base >= RECURRING_MIN_INTERVAL_DAYS)) return null
  let doubled = 0
  for (const interval of intervals) {
    if (withinTolerance(interval, base)) continue
    if (withinTolerance(interval, base * 2)) {
      doubled += 1
      if (doubled > 1) return null
      continue
    }
    return null
  }
  const last = stamps.at(-1)
  if (last === undefined) return null
  const predictedMs = last + Math.round(base * MS_PER_DAY)
  const predictedDay = new Date(predictedMs).toISOString().slice(0, 10)
  const daysUntil = Math.round((predictedMs - todayMs) / MS_PER_DAY)
  if (daysUntil < 0 || daysUntil > BILL_UPCOMING_WINDOW_DAYS) return null
  const amounts = [...group.amountsByDay.values()].toSorted((left, right) => left - right)
  const medianAmount = Math.round(median(amounts))
  if (medianAmount <= 0) return null
  return {
    displayName: group.displayName,
    key: group.key,
    predictedDay,
    daysUntil,
    medianAmountMinor: medianAmount,
  }
}

function billReminder(prediction: BillPrediction): PendingReminder {
  const when =
    prediction.daysUntil === 0
      ? "today"
      : prediction.daysUntil === 1
        ? "tomorrow"
        : `in ${prediction.daysUntil} days`
  return {
    key: `bill:${prediction.key}:${prediction.predictedDay}`,
    kind: "bill",
    title: `${prediction.displayName} charges ${when}`,
    body: `${prediction.displayName} usually charges ${formatMinorAsMoney(prediction.medianAmountMinor)} around ${prediction.predictedDay}.`,
  }
}

function computeBillReminders(
  transactions: readonly Transaction[],
  todayMs: number,
): PendingReminder[] {
  const reminders: PendingReminder[] = []
  for (const group of groupRecurringCandidates(transactions)) {
    const prediction = predictBill(group, todayMs)
    if (prediction) reminders.push(billReminder(prediction))
  }
  reminders.sort((left, right) => left.key.localeCompare(right.key))
  return reminders
}

/**
 * Derive every reminder trigger for the given snapshot. Pure: same inputs in,
 * same reminders out. Empty inputs yield no reminders. Already-fired keys are
 * filtered so a period never double-schedules.
 */
export function computePendingReminders(inputs: ReminderInputs): PendingReminder[] {
  const fired = inputs.firedKeys ?? new Set<string>()
  if (inputs.budgets.length === 0 && inputs.transactions.length === 0) return []
  const todayMs = parseDayMs(inputs.todayIso)
  if (todayMs === null) return []
  const month = inputs.todayIso.slice(0, 7)
  const reminders = [
    ...computeBudgetReminders(inputs.budgets, inputs.transactions, month),
    ...computeBillReminders(inputs.transactions, todayMs),
  ]
  return reminders.filter((reminder) => !fired.has(reminder.key))
}
