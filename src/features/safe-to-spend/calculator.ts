import type { BudgetGoal, IsoDate, Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import type { SubscriptionSummary } from "@/features/subscriptions/detect"

/**
 * Safe-to-spend: one calm number answering "can I spend $X today?".
 *
 * Formula (also shown as a footnote in the UI):
 *
 *   safe-to-spend = max(0, incomeReceivedMTD - billsDueBeforeMonthEnd - plannedBurnRemainingDays)
 *
 * Documented assumptions:
 * - Income is received-to-date only: normalized positive amounts dated within
 *   [monthStart, today]. Future-dated income is never projected, so a payday
 *   later in the month does not inflate today's number; the number steps up
 *   only once the paycheck is recorded. Irregular income is therefore handled
 *   by construction (nothing is smoothed or forecast).
 * - Bills reuse recurring-merchant detection read-only: each detected
 *   subscription repeats every max(1, round(medianIntervalDays)) days from its
 *   last seen date, and every occurrence with today < date <= monthEnd counts
 *   at its median amount. Nothing before or on today counts (already spent or
 *   visible in balances); nothing after month-end counts (next month's
 *   problem).
 * - Planned burn covers the days left: remainingDays = daysInMonth - day(today)
 *   (days after today through month-end, inclusive; 0 on the last day). With
 *   budgets set, burn = (monthlyTotal / 30.4375 + yearlyTotal / 365.25) *
 *   remainingDays, matching the cash-flow forecast's daily-rate convention.
 *   With no budgets set, burn falls back to the trailing-average daily spend
 *   (absolute expenses over the last 30 days / 30) * remainingDays, flagged via
 *   `usedTrailingAverage` so the UI can say so.
 * - The result is floored at zero: overspending shows $0 plus the breakdown,
 *   never a negative number.
 * - Month boundaries use UTC calendar dates so the value is stable regardless
 *   of local timezone.
 */

export const SAFE_TO_SPEND_DAYS_PER_MONTH = 30.4375
export const SAFE_TO_SPEND_DAYS_PER_YEAR = 365.25
export const SAFE_TO_SPEND_TRAILING_LOOKBACK_DAYS = 30

export interface SafeToSpendBill {
  subscriptionKey: string
  displayName: string
  date: IsoDate
  amountMinor: number
}

export interface CalculateSafeToSpendInput {
  transactions: readonly Transaction[]
  /** Recurring-merchant detection output (read-only; computed by the caller). */
  subscriptions: readonly SubscriptionSummary[]
  goals: readonly BudgetGoal[]
  /** ISO date treated as "today". Defaults to the local current date. */
  today?: IsoDate | undefined
}

export interface SafeToSpendResult {
  today: IsoDate
  monthStart: IsoDate
  monthEnd: IsoDate
  remainingDays: number
  incomeMinor: number
  hasIncome: boolean
  billsDueMinor: number
  bills: SafeToSpendBill[]
  burnMinor: number
  dailyBurnMinor: number
  usedTrailingAverage: boolean
  trailingDailySpendMinor: number | null
  safeMinor: number
}

function parseUtcMs(date: string): number | null {
  const time = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(time)) return null
  // Date.parse normalizes calendar-invalid input ("2026-02-30" becomes March
  // 2), so require the parsed date to round-trip exactly.
  return new Date(time).toISOString().slice(0, 10) === date ? time : null
}

function isIsoDate(value: string): value is IsoDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseUtcMs(value) !== null
}

function localTodayIso(): IsoDate {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function addDaysIso(date: IsoDate, days: number): IsoDate {
  const time = parseUtcMs(date)
  if (time === null) throw new Error(`Invalid ISO date: ${date}`)
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10)
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const start = parseUtcMs(from)
  const end = parseUtcMs(to)
  if (start === null || end === null) return 0
  return Math.round((end - start) / 86_400_000)
}

/** Occurrences strictly after today through month-end for one subscription. */
function billsDueForSubscription(
  subscription: SubscriptionSummary,
  today: IsoDate,
  monthEnd: IsoDate,
): SafeToSpendBill[] {
  const intervalDays = Math.max(1, Math.round(subscription.medianIntervalDays))
  if (!isIsoDate(subscription.lastDate)) return []
  if (!(subscription.medianAmountMinor > 0)) return []
  // Jump directly to the first occurrence after today instead of stepping one
  // interval at a time, so very stale schedules terminate immediately.
  const elapsedDays = Math.max(0, daysBetween(subscription.lastDate, today))
  let next = addDaysIso(
    subscription.lastDate,
    (Math.floor(elapsedDays / intervalDays) + 1) * intervalDays,
  )
  const bills: SafeToSpendBill[] = []
  // Always terminates: `next` strictly increases toward the fixed monthEnd.
  while (next <= monthEnd) {
    bills.push({
      subscriptionKey: subscription.key,
      displayName: subscription.displayName,
      date: next,
      amountMinor: subscription.medianAmountMinor,
    })
    next = addDaysIso(next, intervalDays)
  }
  return bills
}

export function calculateSafeToSpend(input: CalculateSafeToSpendInput): SafeToSpendResult {
  const today = input.today ?? localTodayIso()
  if (!isIsoDate(today)) throw new Error(`Invalid today ISO date: ${String(today)}`)

  const monthPrefix = today.slice(0, 7)
  const monthStart: IsoDate = `${monthPrefix}-01`
  const year = Number(today.slice(0, 4))
  const monthOneBased = Number(today.slice(5, 7))
  const daysInMonth = new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate()
  const monthEnd: IsoDate = `${monthPrefix}-${String(daysInMonth).padStart(2, "0")}`
  const remainingDays = daysInMonth - Number(today.slice(8, 10))

  let incomeMinor = 0
  for (const transaction of input.transactions) {
    if (transaction.date < monthStart || transaction.date > today) continue
    const signed = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (signed > 0) incomeMinor += signed
  }

  const bills = input.subscriptions.flatMap((subscription) =>
    billsDueForSubscription(subscription, today, monthEnd),
  )
  bills.sort((left, right) =>
    left.date === right.date
      ? left.subscriptionKey.localeCompare(right.subscriptionKey)
      : left.date.localeCompare(right.date),
  )
  const billsDueMinor = bills.reduce((sum, bill) => sum + bill.amountMinor, 0)

  let monthlyTotalMinor = 0
  let yearlyTotalMinor = 0
  for (const goal of input.goals) {
    if (goal.period === "monthly") monthlyTotalMinor += goal.amountMinor
    else yearlyTotalMinor += goal.amountMinor
  }

  let dailyBurnMinor: number
  let usedTrailingAverage = false
  let trailingDailySpendMinor: number | null = null
  if (monthlyTotalMinor + yearlyTotalMinor > 0) {
    dailyBurnMinor =
      monthlyTotalMinor / SAFE_TO_SPEND_DAYS_PER_MONTH +
      yearlyTotalMinor / SAFE_TO_SPEND_DAYS_PER_YEAR
  } else {
    const windowStart = addDaysIso(today, -(SAFE_TO_SPEND_TRAILING_LOOKBACK_DAYS - 1))
    let spendMinor = 0
    for (const transaction of input.transactions) {
      if (transaction.date < windowStart || transaction.date > today) continue
      const signed = normalizeTransactionAmountMinor(
        transaction.amountMinor,
        transaction.transactionType,
      )
      if (signed < 0) spendMinor += Math.abs(signed)
    }
    trailingDailySpendMinor = spendMinor / SAFE_TO_SPEND_TRAILING_LOOKBACK_DAYS
    dailyBurnMinor = trailingDailySpendMinor
    usedTrailingAverage = true
  }
  const burnMinor = Math.round(dailyBurnMinor * remainingDays)

  return {
    today,
    monthStart,
    monthEnd,
    remainingDays,
    incomeMinor,
    hasIncome: incomeMinor > 0,
    billsDueMinor,
    bills,
    burnMinor,
    dailyBurnMinor,
    usedTrailingAverage,
    trailingDailySpendMinor,
    safeMinor: Math.max(0, incomeMinor - billsDueMinor - burnMinor),
  }
}
