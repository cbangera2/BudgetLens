import type { WealthAccountType, WealthSection, WealthSegment } from "@/domain/models"

export const DEMO_RANGE_START = "2026-01-01"
export const DEMO_RANGE_END = "2026-08-25"
export const DEMO_AS_OF = DEMO_RANGE_END

export interface DemoBundleTransaction {
  date: string
  description: string
  amount: number
  category: string
  transactionType: "debit" | "credit"
  accountName: string
  accountType: string
  provider: string
  labels: string[]
  notes: string | null
}

export interface DemoBreakdownRow {
  asOf: string
  section: WealthSection
  segment: WealthSegment
  balance: number
  descriptor: string
}

export interface DemoWealthAccountRow {
  asOf: string
  accountType: WealthAccountType
  sourceLabel: string
  balance: number
  descriptor: string
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`
}

export function daysBetween(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (
    cursor.getUTCFullYear() < last.getUTCFullYear() ||
    cursor.getUTCMonth() < last.getUTCMonth() ||
    cursor.getUTCDate() < last.getUTCDate()
  ) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  dates.push(end)
  return dates
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function buildSeries(
  startValue: number,
  endValue: number,
  start: string = DEMO_RANGE_START,
  end: string = DEMO_RANGE_END,
): { date: string; value: number }[] {
  const dates = daysBetween(start, end)
  const span = dates.length - 1
  return dates.map((date, index) => {
    if (index === span) return { date, value: endValue }
    const progress = index / span
    const wobble = Math.sin(progress * Math.PI * 9) * startValue * 0.004
    return {
      date,
      value: round2(startValue + (endValue - startValue) * progress + wobble),
    }
  })
}

export function buildBundleDocument(options: {
  transactions: DemoBundleTransaction[]
  netWorthStart: number
  netWorthEnd: number
  investmentsStart: number
  investmentsEnd: number
  breakdown: DemoBreakdownRow[]
  wealthAccounts: DemoWealthAccountRow[]
  start?: string
  end?: string
  exportedAt?: string
}) {
  const start = options.start ?? DEMO_RANGE_START
  const end = options.end ?? DEMO_RANGE_END
  return {
    format: "budgetlens" as const,
    version: 1 as const,
    exportedAt: options.exportedAt ?? `${end}T12:00:00.000Z`,
    dateRange: { start, end },
    transactions: options.transactions.toSorted((left, right) =>
      left.date.localeCompare(right.date),
    ),
    netWorthHistory: buildSeries(options.netWorthStart, options.netWorthEnd, start, end),
    investmentHistory: buildSeries(options.investmentsStart, options.investmentsEnd, start, end),
    netWorthBreakdown: options.breakdown,
    wealthAccounts: options.wealthAccounts,
  }
}
