import { useLiveQuery } from "dexie-react-hooks"
import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import type { BudgetGoal, IsoDate, Transaction } from "@/domain/models"
import { formatMoney } from "@/features/dashboard/format"
import { detectSubscriptions } from "@/features/subscriptions/detect"

import {
  cushionMinorToDollarsInput,
  loadCashflowCushionMinor,
  parseCushionDollarsInput,
  saveCashflowCushionMinor,
} from "./cushion"
import { FORECAST_HORIZON_DAYS, projectCashflow } from "./projection"

function shortLabel(date: IsoDate): string {
  const time = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(time)) return date
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(time))
}

const chartConfig = {
  actual: { label: "Actual balance", color: "var(--chart-1)" },
  projected: { label: "Projected balance", color: "var(--chart-2)" },
} satisfies ChartConfig

export function CashflowForecastSection({
  transactions: injectedTransactions,
  goals: injectedGoals,
  today,
}: {
  transactions?: readonly Transaction[]
  goals?: readonly BudgetGoal[]
  today?: IsoDate
} = {}) {
  const live = useLiveQuery(
    async () =>
      injectedTransactions && injectedGoals
        ? null
        : Promise.all([repositories.transactions.list(), repositories.budgets.list()]),
    [injectedTransactions, injectedGoals],
  )
  const [cushionMinor, setCushionMinor] = useState<number>(() => loadCashflowCushionMinor())
  const [cushionInput, setCushionInput] = useState<string>(() =>
    cushionMinorToDollarsInput(loadCashflowCushionMinor()),
  )
  const [cushionError, setCushionError] = useState<string>("")

  const transactions = injectedTransactions ?? live?.[0] ?? null
  const goals = injectedGoals ?? live?.[1] ?? null

  const result = useMemo(() => {
    if (!transactions || !goals) return null
    const { subscriptions } = detectSubscriptions(transactions)
    return {
      subscriptions,
      projection: projectCashflow({
        transactions,
        subscriptions,
        goals,
        today,
        horizonDays: FORECAST_HORIZON_DAYS,
        cushionMinor,
      }),
    }
  }, [transactions, goals, today, cushionMinor])

  if (!transactions || !goals || !result) return <output>Loading cash-flow forecast…</output>

  const { projection } = result
  const lastHistory = projection.history.at(-1)
  const chartData = [
    ...projection.history.map((point) => ({
      date: point.date,
      label: shortLabel(point.date),
      actual: point.balanceMinor / 100,
      projected:
        point.date === projection.today ? point.balanceMinor / 100 : (null as number | null),
    })),
    ...projection.forecast.map((point) => ({
      date: point.date,
      label: shortLabel(point.date),
      actual: null as number | null,
      projected: point.balanceMinor / 100,
    })),
  ]
  const forecastStartLabel = shortLabel(projection.forecast[0]?.date ?? projection.today)
  const forecastEndLabel = shortLabel(projection.forecast.at(-1)?.date ?? projection.today)
  const lowest = projection.forecast.reduce(
    (minimum, point) => Math.min(minimum, point.balanceMinor),
    projection.startingBalanceMinor,
  )
  const firstBreach = projection.breaches[0]

  function handleCushionChange(value: string) {
    setCushionInput(value)
    const parsed = parseCushionDollarsInput(value)
    if (parsed === null) {
      setCushionError("Enter a cushion of 0 or more.")
      return
    }
    setCushionError("")
    setCushionMinor(parsed)
    saveCashflowCushionMinor(parsed)
  }

  return (
    <section aria-label="Cash-flow forecast">
      <Card>
        <CardHeader>
          <CardTitle>Cash-flow forecast</CardTitle>
          <CardDescription>
            Projected balance for the next {FORECAST_HORIZON_DAYS} days from recurring charges,
            budget burn, and recent daily flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="cashflow-cushion">Low-balance cushion (USD)</Label>
            <Input
              id="cashflow-cushion"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cushionInput}
              onChange={(event) => handleCushionChange(event.target.value)}
              aria-describedby={cushionError ? "cashflow-cushion-error" : undefined}
            />
            {cushionError ? (
              <p id="cashflow-cushion-error" role="alert" className="text-sm text-destructive">
                {cushionError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Warn when the projection dips below {formatMoney(cushionMinor)}.
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Starting {formatMoney(projection.startingBalanceMinor)}
            {lastHistory ? ` · ${projection.history.length} days of actuals` : ""} ·{" "}
            {projection.scheduledCharges.length} recurring charges scheduled · lowest projected{" "}
            {formatMoney(lowest)}.
          </p>

          {chartData.length > 0 ? (
            <figure aria-label="Balance history and 90-day projection">
              <ChartContainer config={chartConfig} className="h-72">
                <LineChart
                  data={chartData}
                  accessibilityLayer
                  responsive
                  style={{ width: "100%", height: "100%" }}
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid horizontal vertical={false} />
                  <XAxis dataKey="label" minTickGap={32} tickLine={false} axisLine={false} />
                  <YAxis width="auto" tickLine={false} axisLine={false} />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        valueFormatter={(value) => formatMoney(Math.round(value * 100))}
                      />
                    }
                  />
                  <Legend content={<ChartLegendContent />} />
                  <ReferenceArea
                    x1={forecastStartLabel}
                    x2={forecastEndLabel}
                    label={{ value: "Projected", position: "insideTop" }}
                    fill="var(--muted)"
                    fillOpacity={0.45}
                  />
                  <ReferenceLine
                    y={cushionMinor / 100}
                    stroke="var(--destructive)"
                    strokeDasharray="5 4"
                    label={{ value: "Cushion", position: "insideTopRight" }}
                  />
                  <Line
                    dataKey="actual"
                    name="Actual balance"
                    type="monotone"
                    stroke="var(--color-actual)"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    dataKey="projected"
                    name="Projected balance"
                    type="monotone"
                    stroke="var(--color-projected)"
                    strokeWidth={2.5}
                    strokeDasharray="7 4"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ChartContainer>
              <figcaption className="sr-only">
                Actual balance through {projection.today}, then projected balance for{" "}
                {FORECAST_HORIZON_DAYS} days. Projected region uses a dashed line.
              </figcaption>
            </figure>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough history yet. The projection will appear once transactions are imported.
            </p>
          )}

          {firstBreach ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              Projected to dip below {formatMoney(cushionMinor)} on {firstBreach.date} (
              {formatMoney(firstBreach.balanceMinor)}), {projection.breaches.length} day
              {projection.breaches.length === 1 ? "" : "s"} under cushion.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Projected to stay above {formatMoney(cushionMinor)} for the next{" "}
              {FORECAST_HORIZON_DAYS} days.
            </p>
          )}

          <div>
            <h3 className="text-sm font-medium">What this assumes</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {projection.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
