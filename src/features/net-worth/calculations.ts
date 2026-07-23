import type { WealthSeries, WealthSnapshot } from "@/domain/models"

export const RANGE_PRESETS = ["1M", "3M", "6M", "YTD", "1Y", "All"] as const

export type RangePreset = (typeof RANGE_PRESETS)[number]

export interface SeriesSummary {
  first: WealthSnapshot
  latest: WealthSnapshot
  absoluteChangeMinor: number | null
  percentageChange: number | null
}

export interface WealthSummary {
  netWorth: SeriesSummary | null
  investment: SeriesSummary | null
  investmentPercentage: number | null
}

export interface WealthChartPoint {
  date: string
  netWorth?: number
  investment?: number
}

const DAY_MILLISECONDS = 86_400_000

function parseCalendarDate(date: string): Date {
  const [yearText = "0", monthText = "1", dayText = "1"] = date.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  return new Date(Date.UTC(year, month - 1, day))
}

function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftMonths(date: Date, months: number): Date {
  const shifted = new Date(date)
  const originalDay = shifted.getUTCDate()
  shifted.setUTCDate(1)
  shifted.setUTCMonth(shifted.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate()
  shifted.setUTCDate(Math.min(originalDay, lastDay))
  return shifted
}

export function rangeStartDate(range: RangePreset, today: string): string | undefined {
  const date = parseCalendarDate(today)
  switch (range) {
    case "1M":
      return toCalendarDate(shiftMonths(date, -1))
    case "3M":
      return toCalendarDate(shiftMonths(date, -3))
    case "6M":
      return toCalendarDate(shiftMonths(date, -6))
    case "YTD":
      return `${date.getUTCFullYear()}-01-01`
    case "1Y":
      return toCalendarDate(shiftMonths(date, -12))
    case "All":
      return undefined
  }
  return undefined
}

export function filterSnapshots(
  snapshots: readonly WealthSnapshot[],
  range: RangePreset,
  today: string,
): WealthSnapshot[] {
  const start = rangeStartDate(range, today)
  return snapshots
    .filter((snapshot) => (!start || snapshot.date >= start) && snapshot.date <= today)
    .toSorted((left, right) =>
      left.date === right.date
        ? left.series.localeCompare(right.series)
        : left.date.localeCompare(right.date),
    )
}

function summarizeSeries(
  snapshots: readonly WealthSnapshot[],
  series: WealthSeries,
): SeriesSummary | null {
  const values = snapshots.filter((snapshot) => snapshot.series === series)
  if (values.length === 0) return null

  const first = values[0]!
  const latest = values.at(-1)!
  if (values.length === 1) {
    return { first, latest, absoluteChangeMinor: null, percentageChange: null }
  }

  const absoluteChangeMinor = latest.valueMinor - first.valueMinor
  return {
    first,
    latest,
    absoluteChangeMinor,
    percentageChange:
      first.valueMinor === 0 ? null : (absoluteChangeMinor / Math.abs(first.valueMinor)) * 100,
  }
}

export function summarizeWealth(snapshots: readonly WealthSnapshot[]): WealthSummary {
  const netWorth = summarizeSeries(snapshots, "netWorth")
  const investment = summarizeSeries(snapshots, "investment")
  return {
    netWorth,
    investment,
    investmentPercentage:
      netWorth && investment && netWorth.latest.valueMinor > 0
        ? (investment.latest.valueMinor / netWorth.latest.valueMinor) * 100
        : null,
  }
}

export function buildChartPoints(snapshots: readonly WealthSnapshot[]): WealthChartPoint[] {
  const byDate = new Map<string, WealthChartPoint>()
  for (const snapshot of snapshots) {
    const point = byDate.get(snapshot.date) ?? { date: snapshot.date }
    point[snapshot.series] = snapshot.valueMinor / 100
    byDate.set(snapshot.date, point)
  }
  return [...byDate.values()].toSorted((left, right) => left.date.localeCompare(right.date))
}

export function daysSince(date: string, today: string): number {
  return Math.max(
    0,
    Math.floor(
      (parseCalendarDate(today).getTime() - parseCalendarDate(date).getTime()) / DAY_MILLISECONDS,
    ),
  )
}
