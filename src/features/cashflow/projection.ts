import type { BudgetGoal, IsoDate, Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { normalizeMerchant, type SubscriptionSummary } from "@/features/subscriptions/detect"

export const FORECAST_HORIZON_DAYS = 90
export const FORECAST_LOOKBACK_DAYS = 30
export const DAYS_PER_MONTH = 30.4375
export const DAYS_PER_YEAR = 365.25

export interface ForecastPoint {
  date: IsoDate
  balanceMinor: number
}

export interface ScheduledCharge {
  subscriptionKey: string
  displayName: string
  date: IsoDate
  amountMinor: number
}

export interface ProjectCashflowInput {
  transactions: readonly Transaction[]
  subscriptions: readonly SubscriptionSummary[]
  goals: readonly BudgetGoal[]
  /** ISO date treated as "today". Defaults to the local current date. */
  today?: IsoDate | undefined
  horizonDays?: number
  lookbackDays?: number
  /** Cushion threshold. Breaches are strictly below this value. */
  cushionMinor?: number
}

export interface ProjectCashflowResult {
  today: IsoDate
  startingBalanceMinor: number
  /** Smoothed residual daily net (income always included, recurring + budgeted spend excluded). */
  averageDailyNetMinor: number
  budgetDailyMinor: number
  history: ForecastPoint[]
  forecast: ForecastPoint[]
  breaches: ForecastPoint[]
  scheduledCharges: ScheduledCharge[]
  assumptions: string[]
}

function localTodayIso(): IsoDate {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function parseUtcMs(date: IsoDate): number | null {
  const time = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(time)) return null
  // Date.parse normalizes calendar-invalid input ("2026-02-30" becomes March
  // 2), so require the parsed date to round-trip exactly.
  return new Date(time).toISOString().slice(0, 10) === date ? time : null
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  const time = parseUtcMs(date)
  if (time === null) throw new Error(`Invalid ISO date: ${date}`)
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10)
}

export function isIsoDate(value: string): value is IsoDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseUtcMs(value) !== null
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const start = parseUtcMs(from)
  const end = parseUtcMs(to)
  if (start === null || end === null) return 0
  return Math.round((end - start) / 86_400_000)
}

/**
 * Cash-flow projection.
 *
 * Documented assumptions (also surfaced in the UI):
 * - Starting balance is lifetime income minus spending recorded in the app
 *   (date <= today). It is not a bank balance.
 * - Recent daily trend averages the last `lookbackDays` days. To avoid
 *   double-counting, expenses matching a detected recurring merchant or a
 *   budgeted category are excluded from that average; all income stays in,
 *   so irregular paydays are smoothed across the whole window instead of
 *   spiking a single day.
 * - Recurring charges repeat on their rounded average interval from the last
 *   seen date, using calendar-date arithmetic so monthly charges cross
 *   month boundaries onto real dates.
 * - Monthly budgets spread evenly per day (monthly / 30.4375, yearly / 365.25)
 *   as planned outflow. Only expenses are matched to budget categories;
 *   income in the same category never counts as spend.
 * - Future transfers, refunds, and manual adjustments are not modeled.
 */
export function projectCashflow(input: ProjectCashflowInput): ProjectCashflowResult {
  const today = input.today ?? localTodayIso()
  if (!isIsoDate(today)) throw new Error("Invalid today ISO date: " + String(today))
  const horizonDays = input.horizonDays ?? FORECAST_HORIZON_DAYS
  const lookbackDays = input.lookbackDays ?? FORECAST_LOOKBACK_DAYS
  if (!Number.isInteger(horizonDays) || horizonDays < 0)
    throw new Error("horizonDays must be a non-negative integer")
  if (!Number.isInteger(lookbackDays) || lookbackDays < 0)
    throw new Error("lookbackDays must be a non-negative integer")

  let startingBalanceMinor = 0
  for (const transaction of input.transactions) {
    if (transaction.date > today) continue
    startingBalanceMinor += normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
  }

  const recurringKeys = new Set(input.subscriptions.map((sub) => sub.key))
  const budgetedCategories = new Set(input.goals.map((goal) => goal.category))

  const windowStart = lookbackDays > 0 ? addDaysIso(today, -(lookbackDays - 1)) : today

  let residualSumMinor = 0
  let windowTotalMinor = 0
  const dailyTotals = new Map<IsoDate, number>()
  for (const transaction of input.transactions) {
    if (transaction.date < windowStart || transaction.date > today) {
      continue
    }
    const signed = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    windowTotalMinor += signed
    dailyTotals.set(transaction.date, (dailyTotals.get(transaction.date) ?? 0) + signed)

    if (signed >= 0) {
      residualSumMinor += signed
      continue
    }
    if (recurringKeys.has(normalizeMerchant(transaction.description))) continue
    if (transaction.category !== null && budgetedCategories.has(transaction.category)) continue
    residualSumMinor += signed
  }

  const averageDailyNetMinor = lookbackDays > 0 ? residualSumMinor / lookbackDays : 0

  let monthlyTotalMinor = 0
  let yearlyTotalMinor = 0
  for (const goal of input.goals) {
    if (goal.period === "monthly") monthlyTotalMinor += goal.amountMinor
    else yearlyTotalMinor += goal.amountMinor
  }
  const budgetDailyMinor = monthlyTotalMinor / DAYS_PER_MONTH + yearlyTotalMinor / DAYS_PER_YEAR

  const endDate = addDaysIso(today, horizonDays)
  const scheduledCharges: ScheduledCharge[] = []
  for (const subscription of input.subscriptions) {
    const intervalDays = Math.max(1, Math.round(subscription.medianIntervalDays))
    if (!isIsoDate(subscription.lastDate)) continue
    if (!(subscription.medianAmountMinor > 0)) continue
    // Jump directly to the first occurrence after today instead of stepping
    // forward one interval at a time, so very stale schedules cannot exhaust
    // a stepping guard and silently drop charges.
    const elapsedDays = Math.max(0, daysBetween(subscription.lastDate, today))
    let next = addDaysIso(
      subscription.lastDate,
      (Math.floor(elapsedDays / intervalDays) + 1) * intervalDays,
    )
    // Always terminates: `next` strictly increases toward the fixed endDate.
    while (next <= endDate) {
      scheduledCharges.push({
        subscriptionKey: subscription.key,
        displayName: subscription.displayName,
        date: next,
        amountMinor: subscription.medianAmountMinor,
      })
      next = addDaysIso(next, intervalDays)
    }
  }
  scheduledCharges.sort((left, right) =>
    left.date === right.date
      ? left.subscriptionKey.localeCompare(right.subscriptionKey)
      : left.date.localeCompare(right.date),
  )

  const chargesByDate = new Map<IsoDate, number>()
  for (const charge of scheduledCharges) {
    chargesByDate.set(charge.date, (chargesByDate.get(charge.date) ?? 0) + charge.amountMinor)
  }

  const history: ForecastPoint[] = []
  if (lookbackDays > 0) {
    let running = startingBalanceMinor - windowTotalMinor
    for (let offset = lookbackDays - 1; offset >= 0; offset -= 1) {
      const date = addDaysIso(today, -offset)
      running += dailyTotals.get(date) ?? 0
      history.push({ date, balanceMinor: Math.round(running) })
    }
  }

  const forecast: ForecastPoint[] = []
  let balance = startingBalanceMinor
  for (let day = 1; day <= horizonDays; day += 1) {
    const date = addDaysIso(today, day)
    balance += averageDailyNetMinor - budgetDailyMinor
    balance -= chargesByDate.get(date) ?? 0
    forecast.push({ date, balanceMinor: Math.round(balance) })
  }

  const cushionMinor = input.cushionMinor
  const breaches =
    cushionMinor === undefined ? [] : forecast.filter((point) => point.balanceMinor < cushionMinor)

  const lookbackLabel = `${lookbackDays}-day`
  const assumptions = [
    `Starting balance is lifetime income minus spending in the app through ${today}; it is not a bank balance.`,
    `Recent daily trend averages the last ${lookbackLabel} window (${formatMinor(averageDailyNetMinor)}/day), excluding recurring charges and budgeted spending so they are not counted twice; irregular paydays are smoothed across the window.`,
    input.subscriptions.length === 0
      ? "No recurring charges were detected, so none are scheduled."
      : `${input.subscriptions.length} recurring charge${input.subscriptions.length === 1 ? "" : "s"} repeat on their average interval from the last seen date.`,
    monthlyTotalMinor + yearlyTotalMinor === 0
      ? "No monthly budgets are set, so no planned budget burn is subtracted."
      : `Monthly budgets contribute ${formatMinor(budgetDailyMinor)}/day of planned spending.`,
    `Projection covers ${horizonDays} days through ${endDate}; transfers, refunds, and new income spikes are not modeled.`,
  ]

  return {
    today,
    startingBalanceMinor,
    averageDailyNetMinor,
    budgetDailyMinor,
    history,
    forecast,
    breaches,
    scheduledCharges,
    assumptions,
  }
}

function formatMinor(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Math.round(value) / 100)
}

export function firstBreachDate(result: ProjectCashflowResult): IsoDate | null {
  return result.breaches[0]?.date ?? null
}

export { daysBetween }
