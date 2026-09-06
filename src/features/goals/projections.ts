import type { NetWorthGoal } from "@/features/goals/model"

export interface GoalHistoryPoint {
  date: string
  valueMinor: number
}

export type NetWorthGoalStatus =
  | "empty"
  | "single-point"
  | "past-target"
  | "achieved"
  | "on-track"
  | "off-track"

export interface NetWorthGoalProjection {
  status: NetWorthGoalStatus
  latest: GoalHistoryPoint | null
  paceMinorPerDay: number | null
  paceMinorPerMonth: number | null
  projectedMinorAtTarget: number | null
  projectedHitDate: string | null
  requiredMinorPerMonth: number | null
}

export const AVERAGE_MONTH_DAYS = 365.2425 / 12

const DAY_MILLISECONDS = 86_400_000

function parseCalendarDate(date: string): Date {
  const [yearText = "0", monthText = "1", dayText = "1"] = date.split("-")
  return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)))
}

function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function daysBetween(start: string, end: string): number {
  return Math.round(
    (parseCalendarDate(end).getTime() - parseCalendarDate(start).getTime()) / DAY_MILLISECONDS,
  )
}

export function addDays(date: string, days: number): string {
  return toCalendarDate(new Date(parseCalendarDate(date).getTime() + days * DAY_MILLISECONDS))
}

function sortedPoints(points: readonly GoalHistoryPoint[]): GoalHistoryPoint[] {
  return [...points].toSorted((left, right) => left.date.localeCompare(right.date))
}

function emptyProjection(): NetWorthGoalProjection {
  return {
    status: "empty",
    latest: null,
    paceMinorPerDay: null,
    paceMinorPerMonth: null,
    projectedMinorAtTarget: null,
    projectedHitDate: null,
    requiredMinorPerMonth: null,
  }
}

/**
 * Fits a least-squares trend line through the history (x = days since the
 * first observation, y = net worth in minor units) and returns its slope in
 * minor units per day. Returns null with fewer than two observations or when
 * every observation shares one date.
 */
export function fitDailyPaceMinor(points: readonly GoalHistoryPoint[]): number | null {
  const ordered = sortedPoints(points)
  if (ordered.length < 2) return null
  const first = ordered[0]!.date
  const xs = ordered.map((point) => daysBetween(first, point.date))
  const ys = ordered.map((point) => point.valueMinor)
  const count = ordered.length
  const sumX = xs.reduce((sum, value) => sum + value, 0)
  const sumY = ys.reduce((sum, value) => sum + value, 0)
  const sumXY = xs.reduce((sum, value, index) => sum + value * ys[index]!, 0)
  const sumXX = xs.reduce((sum, value) => sum + value * value, 0)
  const denominator = count * sumXX - sumX * sumX
  if (denominator === 0) return null
  return (count * sumXY - sumX * sumY) / denominator
}

/**
 * Projects when the current linear pace reaches the goal. Pure arithmetic over
 * synthetic-safe primitives: no date library, no randomness.
 */
export function projectNetWorthGoal(
  points: readonly GoalHistoryPoint[],
  today: string,
  goal: NetWorthGoal,
): NetWorthGoalProjection {
  const ordered = sortedPoints(points)
  if (ordered.length === 0) return emptyProjection()
  const latest = ordered.at(-1)!
  const paceMinorPerDay = fitDailyPaceMinor(ordered)
  const paceMinorPerMonth = paceMinorPerDay === null ? null : paceMinorPerDay * AVERAGE_MONTH_DAYS
  const targetPast = goal.targetDate < today
  const monthsRemaining = targetPast ? 0 : daysBetween(today, goal.targetDate) / AVERAGE_MONTH_DAYS
  const requiredMinorPerMonth =
    monthsRemaining > 0 ? (goal.targetAmountMinor - latest.valueMinor) / monthsRemaining : null

  if (latest.valueMinor >= goal.targetAmountMinor) {
    return {
      status: "achieved",
      latest,
      paceMinorPerDay,
      paceMinorPerMonth,
      projectedMinorAtTarget: null,
      projectedHitDate: null,
      requiredMinorPerMonth: 0,
    }
  }

  if (paceMinorPerDay === null) {
    return {
      status: "single-point",
      latest,
      paceMinorPerDay: null,
      paceMinorPerMonth: null,
      projectedMinorAtTarget: null,
      projectedHitDate: null,
      requiredMinorPerMonth,
    }
  }

  const projectedMinorAtTarget =
    latest.valueMinor + paceMinorPerDay * daysBetween(latest.date, goal.targetDate)

  if (targetPast) {
    return {
      status: "past-target",
      latest,
      paceMinorPerDay,
      paceMinorPerMonth,
      projectedMinorAtTarget,
      projectedHitDate: null,
      requiredMinorPerMonth,
    }
  }

  if (paceMinorPerDay <= 0) {
    return {
      status: "off-track",
      latest,
      paceMinorPerDay,
      paceMinorPerMonth,
      projectedMinorAtTarget,
      projectedHitDate: null,
      requiredMinorPerMonth,
    }
  }

  const projectedHitDate = addDays(
    latest.date,
    Math.ceil((goal.targetAmountMinor - latest.valueMinor) / paceMinorPerDay),
  )
  return {
    status: projectedHitDate <= goal.targetDate ? "on-track" : "off-track",
    latest,
    paceMinorPerDay,
    paceMinorPerMonth,
    projectedMinorAtTarget,
    projectedHitDate,
    requiredMinorPerMonth,
  }
}
