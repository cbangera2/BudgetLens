import type { YearReviewStats } from "./stats"

function formatCardMoney(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100)
}

function formatSignedCardMoney(amountMinor: number): string {
  const formatted = formatCardMoney(Math.abs(amountMinor))
  if (amountMinor > 0) return `+${formatted}`
  if (amountMinor < 0) return `-${formatted}`
  return formatted
}

function formatCardMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number)
  if (year === undefined || monthNumber === undefined) return month
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

/**
 * Portrait preview of the year-in-review share card. On-brand emerald
 * gradient, system styling only, no external assets — mirrors what
 * drawYearReviewCard renders to PNG so the preview matches the export.
 */
export function YearReviewCard({ stats }: { stats: YearReviewStats }) {
  return (
    <div
      data-testid="year-review-card"
      aria-label={`${stats.year} year in review card`}
      className="flex aspect-[4/5] w-full max-w-sm flex-col gap-5 overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 p-6 text-white shadow-sm"
    >
      <div>
        <p className="text-xs font-semibold tracking-widest text-emerald-300">BUDGETLENS</p>
        <p className="mt-1 text-5xl font-extrabold tabular-nums">{stats.year}</p>
        <p className="mt-1 text-sm text-white/70">Year in review</p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-white/65">Income</dt>
          <dd className="text-lg font-bold tabular-nums">{formatCardMoney(stats.incomeMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/65">Spent</dt>
          <dd className="text-lg font-bold tabular-nums">{formatCardMoney(stats.expenseMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/65">
            {stats.savingsRate === null
              ? "Saved"
              : `Saved (${Math.round(stats.savingsRate * 100)}%)`}
          </dt>
          <dd className="text-lg font-bold tabular-nums">{formatCardMoney(stats.savingsMinor)}</dd>
        </div>
      </dl>

      <div>
        <p className="text-sm font-semibold">Top categories</p>
        {stats.topCategories.length === 0 ? (
          <p className="mt-2 text-sm text-white/65">No spending this year</p>
        ) : (
          <ul className="mt-2 grid gap-3">
            {stats.topCategories.map((entry) => (
              <li key={entry.category}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{entry.category}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCardMoney(entry.amountMinor)}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full bg-white/15"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${Math.max(2, Math.round(entry.share * 100))}%` }}
                  />
                </div>
                <span className="sr-only">
                  {entry.category} {Math.round(entry.share * 100)} percent of spending
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto grid gap-1 text-sm">
        <p className="text-white/70">
          Biggest month:{" "}
          {stats.biggestMonth === null
            ? "—"
            : `${formatCardMonth(stats.biggestMonth.month)} (${formatCardMoney(stats.biggestMonth.expenseMinor)})`}
        </p>
        <p className="font-semibold">
          {stats.netWorthDeltaMinor === null
            ? "Net worth: no movement tracked"
            : `Net worth ${formatSignedCardMoney(stats.netWorthDeltaMinor)} this year`}
        </p>
        <p className="text-xs text-white/55">BudgetLens · your data stays on your device</p>
      </div>
    </div>
  )
}
