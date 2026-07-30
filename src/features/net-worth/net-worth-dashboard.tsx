import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  WealthAccountSnapshot,
  WealthBreakdownSnapshot,
  WealthSegment,
  WealthSnapshot,
} from "@/domain/models"
import {
  EditableChartRenderer,
  type ChartDataRow,
  type ChartMetric,
  type ChartPresentationSettings,
} from "@/features/charts/render"
import {
  buildChartPoints,
  daysSince,
  filterSnapshots,
  RANGE_PRESETS,
  rangeStartDate,
  type RangePreset,
  type SeriesSummary,
  summarizeWealth,
} from "@/features/net-worth/calculations"

const STALE_AFTER_DAYS = 45
const EMPTY_BREAKDOWN: readonly WealthBreakdownSnapshot[] = []
const EMPTY_ACCOUNTS: readonly WealthAccountSnapshot[] = []
function localeDate(date: string, locale?: string): string {
  const [yearText = "0", monthText = "1", dayText = "1"] = date.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function currency(valueMinor: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(valueMinor / 100)
}

const wealthChartSettings: ChartPresentationSettings = {
  kind: "area",
  barDirection: "vertical",
  metricKeys: ["netWorth", "investment"],
  palette: "default",
  labelDisplay: "none",
  labelColor: "#475569",
  legend: "bottom",
  grid: "horizontal",
  pieLabelPosition: "outside",
  areaFill: "gradient",
  animationDuration: 0,
  size: "medium",
  height: 320,
  width: { mode: "auto" },
}

const breakdownSegments: readonly {
  key: WealthSegment
  label: string
  color: string
}[] = [
  { key: "cash", label: "Cash", color: "var(--chart-1)" },
  { key: "investments", label: "Investments", color: "var(--chart-2)" },
  { key: "property", label: "Property", color: "var(--chart-3)" },
  { key: "creditCards", label: "Credit cards", color: "var(--chart-4)" },
  { key: "loans", label: "Loans", color: "var(--chart-5)" },
]

const breakdownChartSettings: ChartPresentationSettings = {
  ...wealthChartSettings,
  kind: "bar",
  metricKeys: breakdownSegments.map((segment) => segment.key),
  areaFill: "solid",
}

const accountChartSettings: ChartPresentationSettings = {
  ...wealthChartSettings,
  kind: "bar",
  metricKeys: ["balance"],
  legend: "hidden",
  areaFill: "solid",
}

function currentCalendarDate(): string {
  const date = new Date()
  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function Change({ summary, locale }: { summary: SeriesSummary; locale: string | undefined }) {
  if (summary.absoluteChangeMinor === null) {
    return <span className="text-sm text-muted-foreground">One observation—change unavailable</span>
  }
  const sign = summary.absoluteChangeMinor > 0 ? "+" : ""
  const direction =
    summary.absoluteChangeMinor > 0
      ? "Increase"
      : summary.absoluteChangeMinor < 0
        ? "Decrease"
        : "No change"
  return (
    <p className="text-sm text-muted-foreground">
      <span className="sr-only">{direction}: </span>
      <span className="font-medium text-foreground">
        {sign}
        {currency(summary.absoluteChangeMinor, locale)}
      </span>{" "}
      {summary.percentageChange === null
        ? "(percentage unavailable from a zero starting value)"
        : `(${sign}${summary.percentageChange.toFixed(1)}%)`}
    </p>
  )
}

function SummaryCard({
  label,
  summary,
  locale,
}: {
  label: string
  summary: SeriesSummary | null
  locale: string | undefined
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {summary ? currency(summary.latest.valueMinor, locale) : "No data"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="space-y-1">
            <Change summary={summary} locale={locale} />
            <p className="text-xs text-muted-foreground">
              Latest observation {localeDate(summary.latest.date, locale)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No observations in this range.</p>
        )}
      </CardContent>
    </Card>
  )
}

export interface NetWorthDashboardProps {
  snapshots: readonly WealthSnapshot[]
  breakdown?: readonly WealthBreakdownSnapshot[]
  accounts?: readonly WealthAccountSnapshot[]
  today?: string
  locale?: string
}

export function NetWorthDashboard({
  snapshots,
  breakdown = EMPTY_BREAKDOWN,
  accounts = EMPTY_ACCOUNTS,
  today = currentCalendarDate(),
  locale,
}: NetWorthDashboardProps) {
  const [range, setRange] = useState<RangePreset>("1Y")
  const filtered = useMemo(
    () => filterSnapshots(snapshots, range, today),
    [snapshots, range, today],
  )
  const rangeStart = rangeStartDate(range, today)
  const filteredBreakdown = useMemo(
    () =>
      breakdown.filter(
        (snapshot) => (!rangeStart || snapshot.date >= rangeStart) && snapshot.date <= today,
      ),
    [breakdown, rangeStart, today],
  )
  const filteredAccounts = useMemo(
    () =>
      accounts.filter(
        (snapshot) => (!rangeStart || snapshot.date >= rangeStart) && snapshot.date <= today,
      ),
    [accounts, rangeStart, today],
  )
  const summary = useMemo(() => summarizeWealth(filtered), [filtered])
  const chartPoints = useMemo(() => buildChartPoints(filtered), [filtered])
  const chartRows: ChartDataRow[] = chartPoints.map((point) => ({
    id: point.date,
    label: localeDate(point.date, locale),
    values: { netWorth: point.netWorth, investment: point.investment },
  }))
  const chartMetrics: readonly ChartMetric[] = [
    {
      key: "netWorth",
      label: "Net worth",
      color: "var(--chart-net-worth)",
      formatValue: (value) => currency(value * 100, locale),
    },
    {
      key: "investment",
      label: "Investments",
      color: "var(--chart-investment)",
      formatValue: (value) => currency(value * 100, locale),
    },
  ]
  const latest = filtered.at(-1)
  const staleDays = latest ? daysSince(latest.date, today) : 0
  const hasSingleSeries = [summary.netWorth, summary.investment].some(
    (item) => item && item.first.id === item.latest.id,
  )
  const hasNegative = filtered.some((snapshot) => snapshot.valueMinor < 0)
  const breakdownByDate = new Map<string, Record<string, number>>()
  for (const snapshot of filteredBreakdown) {
    const values = breakdownByDate.get(snapshot.date) ?? {}
    values[snapshot.segment] = snapshot.valueMinor / 100
    breakdownByDate.set(snapshot.date, values)
  }
  const breakdownRows: ChartDataRow[] = [...breakdownByDate.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      id: date,
      label: localeDate(date, locale),
      values,
    }))
  const breakdownMetrics: readonly ChartMetric[] = breakdownSegments.map((segment) => ({
    ...segment,
    formatValue: (value: number) => currency(value * 100, locale),
  }))
  const latestBreakdownDate = filteredBreakdown.at(-1)?.date
  const latestBreakdown = latestBreakdownDate
    ? filteredBreakdown.filter((snapshot) => snapshot.date === latestBreakdownDate)
    : []
  const latestAssetTotal = latestBreakdown
    .filter((snapshot) => snapshot.section === "assets")
    .reduce((sum, snapshot) => sum + snapshot.valueMinor, 0)
  const latestDebtTotal = latestBreakdown
    .filter((snapshot) => snapshot.section === "debts")
    .reduce((sum, snapshot) => sum + snapshot.valueMinor, 0)
  const latestAccountDate = filteredAccounts.at(-1)?.date
  const latestAccounts = latestAccountDate
    ? filteredAccounts.filter((snapshot) => snapshot.date === latestAccountDate)
    : []
  const accountRows: ChartDataRow[] = latestAccounts.map((snapshot) => ({
    id: snapshot.id,
    label: snapshot.sourceLabel,
    values: { balance: snapshot.valueMinor / 100 },
  }))
  const accountMetrics: readonly ChartMetric[] = [
    {
      key: "balance",
      label: "Balance",
      color: "var(--chart-2)",
      formatValue: (value) => currency(value * 100, locale),
    },
  ]

  if (snapshots.length === 0 && breakdown.length === 0 && accounts.length === 0) {
    return (
      <section className="space-y-4" aria-labelledby="net-worth-title">
        <div>
          <h1 id="net-worth-title" className="text-3xl font-semibold tracking-tight">
            Net worth
          </h1>
          <p className="mt-1 text-muted-foreground">
            Track net worth, investments, asset and debt segments, and available account balances.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No wealth history yet</CardTitle>
            <CardDescription>
              Import a Credit Karma wealth-history, breakdown, or account snapshot CSV to begin
              tracking your history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a className="font-medium text-primary underline underline-offset-4" href="/imports">
              Go to Imports
            </a>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section className="space-y-6" aria-labelledby="net-worth-title">
      <div>
        <h1 id="net-worth-title" className="text-3xl font-semibold tracking-tight">
          Net worth
        </h1>
        <p className="mt-1 text-muted-foreground">
          Track net worth, investments, asset and debt segments, and available account balances.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Date range">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={range === preset ? "default" : "outline"}
            aria-pressed={range === preset}
            onClick={() => setRange(preset)}
          >
            {preset}
          </Button>
        ))}
      </div>

      {filtered.length === 0 && filteredBreakdown.length === 0 && filteredAccounts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No observations in {range}</CardTitle>
            <CardDescription>Choose a longer range to see the imported history.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {filtered.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard label="Latest net worth" summary={summary.netWorth} locale={locale} />
                <SummaryCard
                  label="Latest investments"
                  summary={summary.investment}
                  locale={locale}
                />
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Investments as % of net worth</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {summary.investmentPercentage === null
                        ? "Unavailable"
                        : `${summary.investmentPercentage.toFixed(1)}%`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Requires a positive net worth and both series in this range.
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2" aria-live="polite">
                {staleDays > STALE_AFTER_DAYS && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    Data may be stale: the latest observation is {staleDays} days old.
                  </p>
                )}
                {hasSingleSeries && (
                  <p className="rounded-lg border bg-muted p-3 text-sm">
                    A series has only one observation in this range, so its change cannot be
                    calculated.
                  </p>
                )}
                {hasNegative && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    This range includes a negative value. Values are shown as imported.
                  </p>
                )}
              </div>

              <EditableChartRenderer
                storageKey="budgetlens.chart.wealth-history.v1"
                title="Wealth history"
                description={`Net worth and investments for the ${range} range.`}
                settingsDescription="Choose the visible wealth series, chart style, and area fill."
                data={chartRows}
                metrics={chartMetrics}
                initialSettings={wealthChartSettings}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Accessible wealth history</CardTitle>
                  <CardDescription>All observations in the selected range.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">
                      Net worth and investment values by observation date
                    </caption>
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-3 font-medium">Date</th>
                        <th className="p-3 text-right font-medium">Net worth</th>
                        <th className="p-3 text-right font-medium">Investments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartPoints.map((point) => (
                        <tr key={point.date} className="border-b last:border-0">
                          <th scope="row" className="p-3 text-left font-normal">
                            {localeDate(point.date, locale)}
                          </th>
                          <td className="p-3 text-right tabular-nums">
                            {point.netWorth === undefined
                              ? "—"
                              : currency(point.netWorth * 100, locale)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {point.investment === undefined
                              ? "—"
                              : currency(point.investment * 100, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : null}

          {latestBreakdown.length > 0 ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Latest assets</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {currency(latestAssetTotal, locale)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {localeDate(latestBreakdownDate!, locale)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Latest debts</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {currency(latestDebtTotal, locale)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {localeDate(latestBreakdownDate!, locale)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Assets minus debts</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {currency(latestAssetTotal - latestDebtTotal, locale)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Derived from the imported segment snapshot.
                  </CardContent>
                </Card>
              </div>

              <EditableChartRenderer
                storageKey="budgetlens.chart.wealth-breakdown.v1"
                title="Net worth breakdown history"
                description={`Asset and debt segment balances for the ${range} range.`}
                settingsDescription="Choose visible segments, chart style, labels, and colors."
                data={breakdownRows}
                metrics={breakdownMetrics}
                initialSettings={breakdownChartSettings}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Latest segment breakdown</CardTitle>
                  <CardDescription>
                    Current imported totals by asset and debt segment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-3 font-medium">Section</th>
                        <th className="p-3 font-medium">Segment</th>
                        <th className="p-3 text-right font-medium">Balance</th>
                        <th className="p-3 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestBreakdown.map((snapshot) => (
                        <tr key={snapshot.id} className="border-b last:border-0">
                          <td className="p-3 capitalize">{snapshot.section}</td>
                          <td className="p-3">
                            {breakdownSegments.find((item) => item.key === snapshot.segment)
                              ?.label ?? snapshot.segment}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {currency(snapshot.valueMinor, locale)}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {snapshot.descriptor || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : null}

          {latestAccounts.length > 0 ? (
            <>
              <EditableChartRenderer
                storageKey="budgetlens.chart.wealth-accounts.v1"
                title="Latest account balances"
                description={`Available source balances on ${localeDate(latestAccountDate!, locale)}.`}
                settingsDescription="Choose chart style, labels, colors, and dimensions."
                data={accountRows}
                metrics={accountMetrics}
                initialSettings={accountChartSettings}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Latest account sources</CardTitle>
                  <CardDescription>
                    Detailed sources Credit Karma exposes for cash, investments, and property.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-3 font-medium">Type</th>
                        <th className="p-3 font-medium">Source</th>
                        <th className="p-3 text-right font-medium">Balance</th>
                        <th className="p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestAccounts.map((snapshot) => (
                        <tr key={snapshot.id} className="border-b last:border-0">
                          <td className="p-3 capitalize">{snapshot.accountType}</td>
                          <td className="p-3">{snapshot.sourceLabel}</td>
                          <td className="p-3 text-right tabular-nums">
                            {currency(snapshot.valueMinor, locale)}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {snapshot.descriptor || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </section>
  )
}
