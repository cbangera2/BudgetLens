import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { WealthSnapshot } from "@/domain/models"
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
  type RangePreset,
  type SeriesSummary,
  summarizeWealth,
} from "@/features/net-worth/calculations"

const STALE_AFTER_DAYS = 45
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
  today?: string
  locale?: string
}

export function NetWorthDashboard({
  snapshots,
  today = currentCalendarDate(),
  locale,
}: NetWorthDashboardProps) {
  const [range, setRange] = useState<RangePreset>("1Y")
  const filtered = useMemo(
    () => filterSnapshots(snapshots, range, today),
    [snapshots, range, today],
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

  if (snapshots.length === 0) {
    return (
      <section className="space-y-4" aria-labelledby="net-worth-title">
        <div>
          <h1 id="net-worth-title" className="text-3xl font-semibold tracking-tight">
            Net worth
          </h1>
          <p className="mt-1 text-muted-foreground">
            Track your net worth and investments over time.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No wealth history yet</CardTitle>
            <CardDescription>
              Import a Credit Karma net-worth or investment CSV to begin tracking your history.
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
          Track your net worth and investments over time.
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

      {filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No observations in {range}</CardTitle>
            <CardDescription>Choose a longer range to see the imported history.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard label="Latest net worth" summary={summary.netWorth} locale={locale} />
            <SummaryCard label="Latest investments" summary={summary.investment} locale={locale} />
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
                A series has only one observation in this range, so its change cannot be calculated.
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
      )}
    </section>
  )
}
