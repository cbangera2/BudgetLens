export function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(amountMinor / 100)
}

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number)
  if (year === undefined || monthNumber === undefined) return month
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}
