export const MONTHLY_CLOSE_MONTH_PATTERN = /^\d{4}-\d{2}$/

function isValidMonth(month: string): boolean {
  if (!MONTHLY_CLOSE_MONTH_PATTERN.test(month)) return false
  const monthNumber = Number(month.slice(5, 7))
  return monthNumber >= 1 && monthNumber <= 12
}

/**
 * The month to close is always the calendar month before `now`.
 * Previous months have ended by definition, so the banner CTA is valid
 * whenever the closing month holds activity and is still unclosed.
 */
export function closingMonthFor(now: Date): string {
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  const closing = new Date(year, monthIndex - 1, 1)
  const closingYear = closing.getFullYear()
  const closingMonth = String(closing.getMonth() + 1).padStart(2, "0")
  return `${closingYear}-${closingMonth}`
}

export function currentMonthFor(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export function isClosingMonth(month: string, now: Date): boolean {
  if (!isValidMonth(month)) return false
  return month === closingMonthFor(now)
}

export function monthRange(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const from = `${month}-01`
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from, to: `${month}-${String(lastDay).padStart(2, "0")}` }
}

export function formatMonthLabel(month: string): string {
  if (!isValidMonth(month)) return month
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

export function isValidCloseMonth(month: string): boolean {
  return isValidMonth(month)
}
