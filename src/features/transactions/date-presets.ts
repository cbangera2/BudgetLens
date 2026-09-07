// Date preset chips for the Transactions filter bar. All ranges are local
// calendar dates in `YYYY-MM-DD` form, matching stored transaction dates.

export type DatePreset = "last-30" | "month" | "ytd" | "all"

export const DATE_PRESETS: readonly { id: DatePreset; label: string }[] = [
  { id: "last-30", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "ytd", label: "YTD" },
  { id: "all", label: "All" },
]

export interface DateRange {
  /** Inclusive lower bound, "" when unbounded. */
  from: string
  /** Inclusive upper bound, "" when unbounded. */
  to: string
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

export function getDatePresetRange(preset: DatePreset, now: Date = new Date()): DateRange {
  const today = toIsoDate(now)
  if (preset === "all") return { from: "", to: "" }
  if (preset === "last-30") {
    // Inclusive 30-day window ending today.
    return { from: toIsoDate(addDays(now, -29)), to: today }
  }
  if (preset === "month") {
    return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  }
  return { from: toIsoDate(new Date(now.getFullYear(), 0, 1)), to: today }
}

/** Returns the preset matching an explicit range, or null for custom ranges. */
export function matchDatePreset(
  from: string,
  to: string,
  now: Date = new Date(),
): DatePreset | null {
  for (const preset of ["last-30", "month", "ytd", "all"] as const) {
    const range = getDatePresetRange(preset, now)
    if (range.from === from && range.to === to) return preset
  }
  return null
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  // Reject impossible calendar dates such as 2026-02-30.
  const roundTripped = toIsoDate(new Date(year, month - 1, day))
  return roundTripped === value
}
