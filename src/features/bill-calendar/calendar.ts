import type { IsoDate } from "@/domain/models"
import type { SubscriptionSummary } from "@/features/subscriptions/detect"

import { DAY_OVERRIDE_CADENCE, type BillOverrides } from "./overrides"

/**
 * Days past an expected bill date before it counts as overdue.
 *
 * A projected charge whose expected date is today, in the future, or at most
 * this many days in the past still renders as an upcoming chip: merchants
 * often post a day or two late. Only when today is strictly more than
 * `OVERDUE_TOLERANCE_DAYS` after the expected date is the chip highlighted
 * as overdue.
 */
export const OVERDUE_TOLERANCE_DAYS = 3

/**
 * Months of bill history and forecast reachable from the current month in
 * either direction via the calendar navigation.
 */
export const NAVIGATION_RANGE_MONTHS = 12

/** Calendar month in `YYYY-MM` form. */
export type MonthKey = string

export type BillStatus = "upcoming" | "overdue"

export interface BillOccurrence {
  subscriptionKey: string
  displayName: string
  date: IsoDate
  amountMinor: number
  status: BillStatus
}

export interface MonthBounds {
  min: MonthKey
  max: MonthKey
}

function parseUtcMs(date: string): number | null {
  const time = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(time)) return null
  // Date.parse normalizes calendar-invalid input ("2026-02-30" becomes March
  // 2), so require the parsed date to round-trip exactly.
  return new Date(time).toISOString().slice(0, 10) === date ? time : null
}

export function isIsoDate(value: string): value is IsoDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseUtcMs(value) !== null
}

export function isMonthKey(value: string): value is MonthKey {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  const time = parseUtcMs(date)
  if (time === null) throw new Error(`Invalid ISO date: ${date}`)
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10)
}

function daysBetweenIso(from: IsoDate, to: IsoDate): number {
  const start = parseUtcMs(from)
  const end = parseUtcMs(to)
  if (start === null || end === null) return 0
  return Math.round((end - start) / 86_400_000)
}

export function toMonthKey(date: IsoDate): MonthKey {
  return date.slice(0, 7)
}

/** Fixed-width `YYYY-MM` split; callers pass validated month keys. */
function splitMonthKey(month: MonthKey): { year: number; monthIndex: number } {
  return { year: Number(month.slice(0, 4)), monthIndex: Number(month.slice(5, 7)) }
}

export function currentMonthKey(today: IsoDate): MonthKey {
  return toMonthKey(today)
}

export function monthStartIso(month: MonthKey): IsoDate {
  return `${month}-01`
}

export function monthEndIso(month: MonthKey): IsoDate {
  const { year, monthIndex } = splitMonthKey(month)
  // Day zero of the following month is the last day of this month (UTC).
  return new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10)
}

export function monthDayCount(month: MonthKey): number {
  return Number(monthEndIso(month).slice(8, 10))
}

/** Weekday of the first of the month, 0 (Sunday) through 6 (Saturday). */
export function monthStartWeekday(month: MonthKey): number {
  return new Date(`${monthStartIso(month)}T00:00:00Z`).getUTCDay()
}

export function addMonthsToKey(month: MonthKey, delta: number): MonthKey {
  const { year, monthIndex } = splitMonthKey(month)
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`
}

export function monthLabel(month: MonthKey): string {
  const { year, monthIndex } = splitMonthKey(month)
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex - 1, 1)))
}

/**
 * Navigable month window for the calendar.
 *
 * The upper bound is always `NAVIGATION_RANGE_MONTHS` past the current
 * month. The lower bound reaches back `NAVIGATION_RANGE_MONTHS` too, but
 * extends to the earliest detected bill month when that is older, so a
 * freshly imported history is always reachable without unbounded scrolling
 * into the distant past.
 */
export function resolveMonthBounds(
  today: IsoDate,
  earliestBillMonth: MonthKey | null,
): MonthBounds {
  const current = currentMonthKey(today)
  const max = addMonthsToKey(current, NAVIGATION_RANGE_MONTHS)
  let min = addMonthsToKey(current, -NAVIGATION_RANGE_MONTHS)
  if (earliestBillMonth !== null && earliestBillMonth < min) min = earliestBillMonth
  return { min, max }
}

export function clampMonthKey(month: MonthKey, bounds: MonthBounds): MonthKey {
  if (month < bounds.min) return bounds.min
  if (month > bounds.max) return bounds.max
  return month
}

export function canNavigatePrev(month: MonthKey, bounds: MonthBounds): boolean {
  return month > bounds.min
}

export function canNavigateNext(month: MonthKey, bounds: MonthBounds): boolean {
  return month < bounds.max
}

export function earliestSubscriptionMonth(
  subscriptions: readonly SubscriptionSummary[],
): MonthKey | null {
  let earliest: MonthKey | null = null
  for (const subscription of subscriptions) {
    if (!isIsoDate(subscription.lastDate)) continue
    const month = toMonthKey(subscription.lastDate)
    if (earliest === null || month < earliest) earliest = month
  }
  return earliest
}

function statusFor(date: IsoDate, today: IsoDate): BillStatus {
  if (date > today) return "upcoming"
  return daysBetweenIso(date, today) > OVERDUE_TOLERANCE_DAYS ? "overdue" : "upcoming"
}

export interface ProjectionOptions {
  /** Per-merchant user corrections (amount, day-of-month, dismiss). */
  overrides?: BillOverrides | undefined
  /** Normalized merchant keys hidden as transfers. */
  excludedKeys?: ReadonlySet<string> | undefined
}

/**
 * Pin a projected date to a day-of-month within its own month, clamping to
 * the month length (day 31 in February becomes Feb 28/29). Only applied to
 * monthly cadences: pinning a biweekly series to one day would collapse
 * separate occurrences onto the same date.
 */
export function snapDayOfMonth(date: IsoDate, dayOfMonth: number): IsoDate {
  const month = toMonthKey(date)
  const lastDay = Number(monthEndIso(month).slice(8, 10))
  const day = Math.min(Math.max(1, Math.floor(dayOfMonth)), lastDay)
  return `${month}-${String(day).padStart(2, "0")}`
}

/**
 * Project recurring charges onto a calendar month.
 *
 * Reuses the detected cadence verbatim (`medianIntervalDays` rounded to whole
 * days, stepping from `lastDate`, mirroring the cash-flow projection), so
 * this stays purely presentational over detection output. Occurrences land on
 * real calendar dates, which is what carries charges across month boundaries
 * (e.g. Jan 31 plus 30 days lands on Mar 2, skipping February entirely).
 *
 * User overrides and transfer exclusions filter or reshape the projection
 * without touching detection: dismissed merchants and transfer-excluded keys
 * never project, amount overrides replace the detected median, and
 * day-of-month overrides re-anchor monthly occurrences (status and totals use
 * the corrected dates and amounts). A pinned monthly bill occurs once per
 * month: when two cadence steps collapse onto the same pinned day, only the
 * first is kept so totals and overdue counts are not double-counted.
 */
export function projectMonthBills(
  subscriptions: readonly SubscriptionSummary[],
  month: MonthKey,
  today: IsoDate,
  options: ProjectionOptions = {},
): BillOccurrence[] {
  const start = monthStartIso(month)
  const end = monthEndIso(month)
  const overrides = options.overrides ?? {}
  const excludedKeys = options.excludedKeys
  const occurrences: BillOccurrence[] = []
  const pinnedDates = new Set<string>()

  for (const subscription of subscriptions) {
    if (excludedKeys?.has(subscription.key)) continue
    const override = overrides[subscription.key]
    if (override?.dismissed === true) continue
    const amountMinor = override?.amountMinor ?? subscription.medianAmountMinor
    const intervalDays = Math.max(1, Math.round(subscription.medianIntervalDays))
    if (!isIsoDate(subscription.lastDate)) continue
    if (!(amountMinor > 0)) continue
    const pinDay =
      override?.dayOfMonth !== undefined && subscription.cadence === DAY_OVERRIDE_CADENCE
        ? override.dayOfMonth
        : null

    // Jump straight to the cadence step nearest the month instead of walking
    // from lastDate, so very stale schedules stay cheap.
    const daysToStart = daysBetweenIso(subscription.lastDate, start)
    let step = Math.max(1, Math.floor(daysToStart / intervalDays))
    // Always terminates: each iteration advances one interval toward end.
    for (;;) {
      const gridDate = addDaysIso(subscription.lastDate, step * intervalDays)
      if (gridDate > end) break
      if (gridDate >= start) {
        const date = pinDay === null ? gridDate : snapDayOfMonth(gridDate, pinDay)
        const pinnedKey = `${subscription.key}|${date}`
        // A pinned monthly bill fires once per month: collapse duplicate steps
        // instead of counting the amount twice.
        if (pinDay !== null && pinnedDates.has(pinnedKey)) {
          step += 1
          continue
        }
        if (pinDay !== null) pinnedDates.add(pinnedKey)
        occurrences.push({
          subscriptionKey: subscription.key,
          displayName: subscription.displayName,
          date,
          amountMinor,
          status: statusFor(date, today),
        })
      }
      step += 1
    }
  }

  occurrences.sort((left, right) =>
    left.date === right.date
      ? left.subscriptionKey.localeCompare(right.subscriptionKey)
      : left.date.localeCompare(right.date),
  )
  return occurrences
}

export function monthTotalMinor(occurrences: readonly BillOccurrence[]): number {
  return occurrences.reduce((sum, occurrence) => sum + occurrence.amountMinor, 0)
}

export function countOverdue(occurrences: readonly BillOccurrence[]): number {
  return occurrences.filter((occurrence) => occurrence.status === "overdue").length
}

export function formatBillMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    amountMinor / 100,
  )
}
