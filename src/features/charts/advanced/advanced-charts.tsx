import { barY, cell, defineChart, dot, link, ruleY, stack, text } from "@tanstack/charts"
import { treemap } from "@tanstack/charts/hierarchy/treemap"
import {
  angleGrid,
  pie,
  polar,
  radialArc,
  radialArea,
  radialGrid,
  radialLine,
  radialText,
} from "@tanstack/charts/polar"
import { Chart } from "@tanstack/charts/react"
import { scaleBand } from "@tanstack/charts/scales/band"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scalePoint } from "@tanstack/charts/scales/point"
import { tooltip } from "@tanstack/charts/tooltip"
import { useMemo } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Transaction } from "@/domain/models"
import { formatMoney } from "@/features/dashboard/format"

import {
  buildHeatmapCells,
  buildLollipopRows,
  buildRadarProfile,
  buildSavingsGauge,
  buildStackedCategoryRows,
  buildTreemapRows,
  buildWaterfallNodes,
  HEATMAP_LEVELS,
  HEATMAP_WEEKDAYS,
} from "./builders"

const CATEGORY_RANGE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
]

const HEATMAP_RANGE = ["#f1f5f9", "#bbf7d0", "#4ade80", "#16a34a", "#14532d"]

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

function moneyTicks(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

/** Monthly expenses stacked by top categories (TanStack catalog: bar-stacked). */
export function StackedCategoryBars({ transactions }: { transactions: readonly Transaction[] }) {
  const { rows, categories } = useMemo(() => buildStackedCategoryRows(transactions), [transactions])
  const definition = useMemo(
    () =>
      rows.length === 0
        ? null
        : defineChart({
            marks: [
              barY(rows, {
                x: "month",
                y: "amount",
                z: "category",
                color: "category",
                key: "id",
                layout: stack({ order: categories }),
              }),
              ruleY([0]),
            ],
            scales: {
              x: { scale: () => scaleBand().padding(0.2), axis: { label: "Month" } },
              y: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: { label: "Expenses", ticks: { format: moneyTicks } },
              },
            },
            color: { domain: categories, range: CATEGORY_RANGE },
            svgAnimation: true,
            tooltip,
          }),
    [rows, categories],
  )

  return (
    <Card className="pt-0" aria-labelledby="stacked-bars-title">
      <CardHeader className="border-b py-5">
        <CardTitle id="stacked-bars-title">Spending stacks</CardTitle>
        <CardDescription>
          Monthly expenses stacked by top categories with the remainder as Other.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!definition ? (
          <EmptyChart message="No expense activity to stack yet." />
        ) : (
          <figure aria-labelledby="stacked-bars-title" style={{ height: 320 }}>
            <Chart
              definition={definition}
              ariaLabel="Monthly expenses stacked by category"
              className="h-full w-full"
            />
            <figcaption className="sr-only">
              Stacked monthly expenses across {categories.length} category groups.
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  )
}

/** Single-period cash-flow bridge (TanStack catalog: 29-waterfall). */
export function CashFlowWaterfall({ transactions }: { transactions: readonly Transaction[] }) {
  const nodes = useMemo(() => buildWaterfallNodes(transactions), [transactions])
  const definition = useMemo(
    () =>
      nodes.length === 0
        ? null
        : defineChart({
            marks: [
              barY(nodes, {
                x: "label",
                y1: "start",
                y2: "end",
                color: "kind",
                key: "label",
                radius: 5,
              }),
              ruleY([0]),
            ],
            scales: {
              x: { scale: () => scaleBand().padding(0.25) },
              y: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: { label: "Amount", ticks: { format: moneyTicks } },
              },
            },
            color: {
              domain: ["increase", "decrease", "total"],
              range: ["var(--chart-savings)", "var(--chart-expense)", "var(--chart-income)"],
            },
            svgAnimation: true,
            tooltip,
          }),
    [nodes],
  )

  return (
    <Card className="pt-0" aria-labelledby="waterfall-title">
      <CardHeader className="border-b py-5">
        <CardTitle id="waterfall-title">Cash-flow waterfall</CardTitle>
        <CardDescription>
          How income minus expenses bridges into savings for the current filters.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!definition ? (
          <EmptyChart message="Import transactions to see the cash-flow bridge." />
        ) : (
          <figure aria-labelledby="waterfall-title" style={{ height: 300 }}>
            <Chart
              definition={definition}
              ariaLabel="Cash-flow waterfall from income to savings"
              className="h-full w-full"
            />
            <figcaption className="sr-only">
              Income {formatMoney(nodes[0] ? (nodes[0].end - nodes[0].start) * 100 : 0)} bridges to
              savings.
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  )
}

/** Normalized top-category spending polygon (TanStack catalog: 75-radar). */
export function SpendingRadar({ transactions }: { transactions: readonly Transaction[] }) {
  const { points } = useMemo(() => buildRadarProfile(transactions), [transactions])
  const categories = useMemo(() => [...new Set(points.map((point) => point.category))], [points])
  const definition = useMemo(
    () =>
      points.length === 0
        ? null
        : defineChart({
            marks: [
              polar({
                radiusRatio: 0.72,
                scales: {
                  angle: { scale: () => scalePoint().padding(0.5) },
                  radius: { scale: scaleLinear().domain([0, 1]) },
                },
                guides: [
                  radialGrid({ values: [0.25, 0.5, 0.75, 1], shape: "polygon" }),
                  angleGrid({ labels: true }),
                ],
                marks: [
                  radialArea(points, {
                    angle: "category",
                    radius: "share",
                    key: "id",
                    fill: "var(--chart-1)",
                    fillOpacity: 0.25,
                  }),
                  radialLine(points, {
                    angle: "category",
                    radius: "share",
                    key: "id",
                    stroke: "var(--chart-1)",
                    strokeWidth: 2,
                  }),
                ],
              }),
            ],
            scales: { x: null, y: null },
            svgAnimation: true,
            tooltip,
          }),
    [points],
  )

  return (
    <Card className="pt-0" aria-labelledby="radar-title">
      <CardHeader className="border-b py-5">
        <CardTitle id="radar-title">Spending radar</CardTitle>
        <CardDescription>
          Top categories scaled against the largest one for the current filters.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!definition ? (
          <EmptyChart message="Add spending in at least three categories to draw the radar." />
        ) : (
          <figure aria-labelledby="radar-title" style={{ height: 320 }}>
            <Chart
              definition={definition}
              ariaLabel="Spending radar across top categories"
              className="h-full w-full"
            />
            <figcaption className="sr-only">
              Spending profile across {categories.join(", ")}.
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  )
}

/** Weekday-by-week expense intensity (TanStack catalog: heatmap-labeled). */
export function DailyHeatmap({ transactions }: { transactions: readonly Transaction[] }) {
  const { cells } = useMemo(() => buildHeatmapCells(transactions), [transactions])
  const definition = useMemo(
    () =>
      cells.length === 0
        ? null
        : defineChart({
            marks: [
              cell(cells, {
                x: "week",
                y: "weekday",
                z: "level",
                color: "level",
                key: "id",
              }),
            ],
            scales: {
              x: { scale: () => scaleBand().padding(0.08), grid: false },
              y: {
                scale: scaleBand()
                  .domain([...HEATMAP_WEEKDAYS])
                  .padding(0.08),
                grid: false,
              },
            },
            color: { domain: [...HEATMAP_LEVELS], range: HEATMAP_RANGE },
            svgAnimation: true,
            tooltip,
          }),
    [cells],
  )

  return (
    <Card className="pt-0" aria-labelledby="heatmap-title">
      <CardHeader className="border-b py-5">
        <CardTitle id="heatmap-title">Daily spending heatmap</CardTitle>
        <CardDescription>
          Expense intensity by weekday and week, bucketed from Low to Peak.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!definition ? (
          <EmptyChart message="No daily expenses to map yet." />
        ) : (
          <figure aria-labelledby="heatmap-title" style={{ height: 300 }}>
            <Chart
              definition={definition}
              ariaLabel="Daily spending intensity heatmap"
              className="h-full w-full"
            />
            <figcaption className="sr-only">
              {cells.length} active days mapped by weekday and week.
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  )
}

/** Savings-rate arc gauge (TanStack catalog: needle-gauge composition). */
export function SavingsGauge({ transactions }: { transactions: readonly Transaction[] }) {
  const reading = useMemo(() => buildSavingsGauge(transactions), [transactions])
  const definition = useMemo(() => {
    if (!reading) return null
    const parts = [
      { id: "saved", value: Math.max(0.001, reading.rate * 100) },
      { id: "remaining", value: Math.max(0.001, 100 - reading.rate * 100) },
    ]
    const slices = pie(parts, {
      value: "value",
      startAngle: -Math.PI * 0.75,
      endAngle: Math.PI * 0.75,
    })
    return defineChart({
      marks: [
        polar({
          radiusRatio: 0.84,
          scales: {
            angle: { scale: scaleLinear().domain([0, 1]) },
            radius: { scale: scaleLinear().domain([0, 1]) },
          },
          marks: [
            radialArc(slices, {
              innerRadius: ({ radius }) => radius * 0.72,
              cornerRadius: 999,
              color: "id",
              key: "id",
            }),
            radialText([{ ...reading, id: "reading" }], {
              angle: 0,
              radius: 0,
              text: (row) => `${(row.rate * 100).toFixed(1)}%`,
              key: "id",
              fill: "currentColor",
              fontSize: 30,
              fontWeight: 700,
            }),
          ],
        }),
      ],
      scales: { x: null, y: null },
      color: {
        domain: ["saved", "remaining"],
        range: ["var(--chart-savings)", "var(--muted)"],
      },
      svgAnimation: true,
      tooltip,
    })
  }, [reading])

  return (
    <Card className="pt-0" aria-labelledby="gauge-title">
      <CardHeader className="border-b py-5">
        <CardTitle id="gauge-title">Savings gauge</CardTitle>
        <CardDescription>Share of income kept as savings in the current filters.</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!reading || !definition ? (
          <EmptyChart message="Add income to measure a savings rate." />
        ) : (
          <figure aria-labelledby="gauge-title" style={{ height: 280 }}>
            <Chart
              definition={definition}
              ariaLabel={`Savings rate ${(reading.rate * 100).toFixed(1)} percent`}
              className="h-full w-full"
            />
            <figcaption className="sr-only">
              {formatMoney(reading.savings * 100)} saved of {formatMoney(reading.income * 100)}{" "}
              income.
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  )
}

/** Area-proportional category breakdown (TanStack catalog: treemap). */
export function SpendingTreemap({ transactions }: { transactions: readonly Transaction[] }) {
  const { rows, categories } = useMemo(() => buildTreemapRows(transactions), [transactions])
  const definition = useMemo(
    () =>
      rows.length === 0
        ? null
        : defineChart({
            marks: [
              treemap(rows, {
                path: "name",
                delimiter: "/",
                value: "size",
                ratio: 4 / 3,
                round: true,
                paddingInner: 2,
                color: "name",
                label: "name",
                labelFontSize: 12,
                inset: 1,
                stroke: "var(--card)",
              }),
            ],
            scales: { x: null, y: null },
            guides: false,
            margin: 0,
            color: {
              domain: categories.map((category) => `Spending/${category}`),
              range: CATEGORY_RANGE,
            },
            svgAnimation: true,
            tooltip,
          }),
    [rows, categories],
  )

  return (
    <Card className="pt-0" aria-labelledby="treemap-title">
      <CardHeader className="border-b py-5">
        <CardTitle id="treemap-title">Spending treemap</CardTitle>
        <CardDescription>Category share drawn as area for the current filters.</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!definition ? (
          <EmptyChart message="No expenses to tile yet." />
        ) : (
          <figure aria-labelledby="treemap-title" style={{ height: 320 }}>
            <Chart
              definition={definition}
              ariaLabel="Spending treemap by category"
              className="h-full w-full"
            />
            <figcaption className="sr-only">
              {categories.length} categories sized by spending.
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  )
}

/** Ranked category magnitudes (TanStack catalog: lollipop). */
export function TopCategoriesLollipop({ transactions }: { transactions: readonly Transaction[] }) {
  const rows = useMemo(() => buildLollipopRows(transactions), [transactions])
  const definition = useMemo(
    () =>
      rows.length === 0
        ? null
        : defineChart({
            marks: [
              link(rows, {
                x1: () => 0,
                x2: "amount",
                y1: "category",
                y2: "category",
                key: "id",
                stroke: "var(--border)",
                strokeWidth: 2,
              }),
              dot(rows, {
                x: "amount",
                y: "category",
                key: "id",
                fill: "var(--chart-1)",
                r: 5,
              }),
              text(rows, {
                x: "amount",
                y: "category",
                text: "label",
                key: "id",
                fill: "var(--muted-foreground)",
                fontSize: 12,
                anchor: "start",
                dx: 10,
              }),
            ],
            scales: {
              x: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: { label: "Expenses", ticks: { format: moneyTicks } },
              },
              y: {
                scale: scaleBand()
                  .domain(rows.map((row) => row.category))
                  .padding(0.35),
              },
            },
            svgAnimation: true,
            tooltip,
          }),
    [rows],
  )

  return (
    <Card className="pt-0" aria-labelledby="lollipop-title">
      <CardHeader className="border-b py-5">
        <CardTitle id="lollipop-title">Top categories</CardTitle>
        <CardDescription>Ranked expense magnitudes without implying area.</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!definition ? (
          <EmptyChart message="No ranked expenses yet." />
        ) : (
          <figure aria-labelledby="lollipop-title" style={{ height: 320 }}>
            <Chart
              definition={definition}
              ariaLabel="Top spending categories ranked"
              className="h-full w-full"
            />
            <figcaption className="sr-only">
              {rows.length} categories ranked, led by {rows[0]?.category}.
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  )
}
