import { areaY, barX, barY, defineChart, group, lineY, text } from "@tanstack/charts"
import { pie, polar, radialArc, radialText } from "@tanstack/charts/polar"
import { Chart } from "@tanstack/charts/react"
import { scaleBand } from "@tanstack/charts/scales/band"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { scalePoint } from "@tanstack/charts/scales/point"
import { tooltip } from "@tanstack/charts/tooltip"
import { useId, useMemo, type ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type ChartKind = "bar" | "line" | "area" | "pie"
export type BarDirection = "vertical" | "horizontal"
export type ChartPalette = "default" | "warm" | "cool" | "rainbow"
export type ChartLabelDisplay = "none" | "value" | "percent" | "both"
export type ChartLegendPlacement = "top" | "bottom" | "left" | "right" | "hidden"
export type ChartGrid = "none" | "horizontal" | "vertical" | "both"
export type PieLabelPosition = "none" | "inside" | "outside" | "center"
export type ChartSize = "small" | "medium" | "large" | "custom"
export type ChartWidth = { mode: "auto" } | { mode: "custom"; value: number }
export type AreaFill = "gradient" | "solid" | "none"

export interface ChartPresentationSettings {
  kind: ChartKind
  barDirection: BarDirection
  metricKeys: string[]
  palette: ChartPalette
  labelDisplay: ChartLabelDisplay
  labelColor: string
  legend: ChartLegendPlacement
  grid: ChartGrid
  pieLabelPosition: PieLabelPosition
  areaFill: AreaFill
  animationDuration: number
  size: ChartSize
  height: number
  width: ChartWidth
}

export interface ChartMetric {
  key: string
  label: string
  color?: string
  formatValue?: (value: number) => string
}

export interface ChartDataRow {
  id: string
  label: string
  values: Readonly<Record<string, number | null | undefined>>
}

export interface CustomChartRendererProps {
  title: string
  description?: string
  data: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  emptyMessage?: string
  tableInitiallyOpen?: boolean
  actions?: ReactNode
}

const palettes: Record<ChartPalette, readonly string[]> = {
  default: [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
  ],
  warm: ["#d65a3a", "#e68b24", "#b93557", "#e0aa23", "#9e3f2f", "#ef7150"],
  cool: ["#2575c4", "#198f91", "#655dcc", "#2b9b69", "#4166a9", "#32a0b8"],
  rainbow: ["#db3d56", "#df8125", "#d6ae20", "#35a060", "#327cc3", "#805bc2"],
}

const clampDimension = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

function colorAt(colors: readonly string[], index: number): string {
  return colors[index % colors.length] ?? "#16a36a"
}

function totalForMetric(rows: readonly ChartDataRow[], metricKey: string): number {
  return rows.reduce((total, row) => total + Math.abs(row.values[metricKey] ?? 0), 0)
}

function formatLabel(
  value: number,
  total: number,
  display: ChartLabelDisplay,
  formatter: (value: number) => string,
): string {
  const formattedValue = formatter(value)
  const percent = total === 0 ? "0%" : `${((Math.abs(value) / total) * 100).toFixed(1)}%`
  if (display === "value") return formattedValue
  if (display === "percent") return percent
  if (display === "both") return `${formattedValue} · ${percent}`
  return ""
}

function formatDefault(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function AccessibleDataTable({
  title,
  rows,
  metrics,
  initiallyOpen,
}: {
  title: string
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  initiallyOpen: boolean
}) {
  return (
    <details className="rounded-xl border bg-muted/20" open={initiallyOpen || undefined}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        View chart data as a table
      </summary>
      <div className="overflow-x-auto border-t">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Data shown in {title}</caption>
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th scope="col" className="p-3 font-medium">
                Label
              </th>
              {metrics.map((metric) => (
                <th scope="col" className="p-3 text-right font-medium" key={metric.key}>
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b last:border-0" key={row.id}>
                <th scope="row" className="p-3 text-left font-normal">
                  {row.label}
                </th>
                {metrics.map((metric) => {
                  const value = row.values[metric.key]
                  return (
                    <td className="p-3 text-right font-mono tabular-nums" key={metric.key}>
                      {value === null || value === undefined
                        ? "—"
                        : (metric.formatValue ?? formatDefault)(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

interface LongRow {
  id: string
  label: string
  metricKey: string
  value: number
}

interface PieSliceInput {
  id: string
  label: string
  value: number
  metricKey: string
}

function ChartLegend({
  metrics,
  colors,
  placement,
}: {
  metrics: readonly ChartMetric[]
  colors: readonly string[]
  placement: ChartLegendPlacement
}) {
  if (placement === "hidden" || metrics.length === 0) return null
  const vertical = placement === "left" || placement === "right"
  return (
    <div
      data-testid="chart-legend"
      aria-label="Chart legend"
      className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground ${
        placement === "top"
          ? "justify-center pb-1"
          : placement === "bottom"
            ? "justify-center pt-1"
            : vertical
              ? "flex-col items-start justify-center gap-2"
              : "justify-center pt-1"
      }`}
    >
      {metrics.map((metric, index) => (
        <span key={metric.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: colorAt(colors, index) }}
          />
          {metric.label}
        </span>
      ))}
    </div>
  )
}

interface CartesianPrep {
  longRows: LongRow[]
  labeledRows: (LongRow & { labelText: string })[]
  showLabels: boolean
  xGrid: boolean
  yGrid: boolean
  metricKeys: string[]
  seriesColors: string[]
  animation: false | { duration: number }
}

function useCartesianPrep(
  rows: readonly ChartDataRow[],
  metrics: readonly ChartMetric[],
  settings: ChartPresentationSettings,
  colors: readonly string[],
): CartesianPrep {
  return useMemo(() => {
    const longRows: LongRow[] = []
    for (const row of rows) {
      for (const metric of metrics) {
        const value = row.values[metric.key]
        if (value === null || value === undefined || !Number.isFinite(value)) continue
        longRows.push({
          id: `${row.id}:${metric.key}`,
          label: row.label,
          metricKey: metric.key,
          value,
        })
      }
    }

    const totals = Object.fromEntries(
      metrics.map((metric) => [metric.key, totalForMetric(rows, metric.key)]),
    )
    const formatters = Object.fromEntries(
      metrics.map((metric) => [metric.key, metric.formatValue ?? formatDefault]),
    )
    const showLabels = settings.labelDisplay !== "none"
    const labeledRows = showLabels
      ? longRows.map((row) => ({
          ...row,
          labelText: formatLabel(
            row.value,
            totals[row.metricKey] ?? 0,
            settings.labelDisplay,
            formatters[row.metricKey] ?? formatDefault,
          ),
        }))
      : []

    return {
      longRows,
      labeledRows,
      showLabels,
      xGrid: settings.grid === "vertical" || settings.grid === "both",
      yGrid: settings.grid === "horizontal" || settings.grid === "both",
      metricKeys: metrics.map((metric) => metric.key),
      seriesColors: metrics.map((metric, index) => metric.color ?? colorAt(colors, index)),
      animation: settings.animationDuration > 0 ? { duration: settings.animationDuration } : false,
    }
  }, [rows, metrics, settings, colors])
}

function HorizontalBarChartBody({
  rows,
  metrics,
  settings,
  colors,
}: {
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  colors: readonly string[]
}) {
  const prep = useCartesianPrep(rows, metrics, settings, colors)
  const definition = useMemo(() => {
    // Grouped bars share one band center, but text marks don't participate in
    // the group layout. Offset each label vertically onto its own bar so
    // multi-metric value labels don't collide like unpositioned captions.
    const renderedHeight =
      settings.size === "small"
        ? 200
        : settings.size === "medium"
          ? 300
          : settings.size === "large"
            ? 400
            : clampDimension(settings.height, 100, 800)
    const band = (renderedHeight - 96) / Math.max(1, rows.length)
    const step = band / Math.max(1, metrics.length)
    const metricIndex = new Map(metrics.map((metric, index) => [metric.key, index]))
    return defineChart({
      marks: [
        barX(prep.longRows, {
          x: "value",
          y: "label",
          z: "metricKey",
          color: "metricKey",
          key: "id",
          layout: group(),
          radius: 5,
        }),
        ...(prep.showLabels
          ? [
              text(prep.labeledRows, {
                x: "value",
                y: "label",
                text: "labelText",
                key: "id",
                fill: settings.labelColor,
                fontSize: 12,
                anchor: "start",
                dx: 8,
                dy: (row) =>
                  ((metricIndex.get(row.metricKey) ?? 0) - (metrics.length - 1) / 2) * step,
              }),
            ]
          : []),
      ],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: prep.xGrid },
        y: { scale: () => scaleBand().padding(0.2), grid: prep.yGrid },
      },
      color: { domain: prep.metricKeys, range: prep.seriesColors },
      svgAnimation: prep.animation,
      tooltip,
    })
  }, [prep, settings.labelColor, settings.size, settings.height, rows.length, metrics])

  return (
    <Chart
      definition={definition}
      ariaLabel="Horizontal bar chart"
      className="h-full min-h-0 w-full"
    />
  )
}

function VerticalBarChartBody({
  rows,
  metrics,
  settings,
  colors,
}: {
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  colors: readonly string[]
}) {
  const prep = useCartesianPrep(rows, metrics, settings, colors)
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(prep.longRows, {
            x: "label",
            y: "value",
            z: "metricKey",
            color: "metricKey",
            key: "id",
            layout: group(),
            radius: 5,
          }),
          ...(prep.showLabels
            ? [
                text(prep.labeledRows, {
                  x: "label",
                  y: "value",
                  text: "labelText",
                  key: "id",
                  fill: settings.labelColor,
                  fontSize: 12,
                  anchor: "middle",
                  dy: -8,
                }),
              ]
            : []),
        ],
        scales: {
          x: { scale: () => scaleBand().padding(0.2), grid: prep.xGrid },
          y: { scale: scaleLinear, nice: true, grid: prep.yGrid },
        },
        color: { domain: prep.metricKeys, range: prep.seriesColors },
        svgAnimation: prep.animation,
        tooltip,
      }),
    [prep, settings.labelColor],
  )

  return (
    <Chart
      definition={definition}
      ariaLabel="Vertical bar chart"
      className="h-full min-h-0 w-full"
    />
  )
}

function AreaChartBody({
  rows,
  metrics,
  settings,
  colors,
}: {
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  colors: readonly string[]
}) {
  const prep = useCartesianPrep(rows, metrics, settings, colors)
  const gradientPrefix = useId().replaceAll(":", "")
  const definition = useMemo(() => {
    const metricIndex = new Map(metrics.map((metric, index) => [metric.key, index]))
    const gradient = settings.areaFill === "gradient"
    // Per-series linear gradients restore the old renderer's AREA_FILLS look:
    // strong at the curve fading toward the baseline.
    const gradients = gradient
      ? metrics.map((metric, index) => {
          const color = metric.color ?? colorAt(prep.seriesColors, index)
          return {
            id: `${gradientPrefix}-area-${index}`,
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1,
            stops: [
              { offset: 0, color, opacity: 0.8 },
              { offset: 1, color, opacity: 0.1 },
            ],
          }
        })
      : []
    return defineChart({
      marks: [
        areaY(prep.longRows, {
          x: "label",
          y: "value",
          // Explicit zero baseline: areas overlap like the previous renderer
          // instead of using TanStack's implicit stacking.
          y1: 0,
          z: "metricKey",
          color: "metricKey",
          key: "id",
          ...(gradient
            ? {
                fill: (row: LongRow) =>
                  `url(#${gradientPrefix}-area-${metricIndex.get(row.metricKey) ?? 0})`,
              }
            : settings.areaFill === "none"
              ? { fill: "transparent" as const }
              : {}),
          fillOpacity: gradient ? 1 : settings.areaFill === "solid" ? 0.18 : 0,
          strokeWidth: 2,
        }),
        ...(prep.showLabels
          ? [
              text(prep.labeledRows, {
                x: "label",
                y: "value",
                text: "labelText",
                key: "id",
                fill: settings.labelColor,
                fontSize: 12,
                anchor: "middle",
                dy: -10,
              }),
            ]
          : []),
      ],
      scales: {
        x: { scale: () => scalePoint().padding(0.2), grid: prep.xGrid },
        y: { scale: scaleLinear, nice: true, grid: prep.yGrid },
      },
      color: { domain: prep.metricKeys, range: prep.seriesColors },
      gradients,
      svgAnimation: prep.animation,
      tooltip,
    })
  }, [prep, metrics, gradientPrefix, settings.areaFill, settings.labelColor])

  return <Chart definition={definition} ariaLabel="Area chart" className="h-full min-h-0 w-full" />
}

function LineChartBody({
  rows,
  metrics,
  settings,
  colors,
}: {
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  colors: readonly string[]
}) {
  const prep = useCartesianPrep(rows, metrics, settings, colors)
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(prep.longRows, {
            x: "label",
            y: "value",
            z: "metricKey",
            color: "metricKey",
            key: "id",
            points: true,
            strokeWidth: 2.5,
          }),
          ...(prep.showLabels
            ? [
                text(prep.labeledRows, {
                  x: "label",
                  y: "value",
                  text: "labelText",
                  key: "id",
                  fill: settings.labelColor,
                  fontSize: 12,
                  anchor: "middle",
                  dy: -10,
                }),
              ]
            : []),
        ],
        scales: {
          x: { scale: () => scalePoint().padding(0.2), grid: prep.xGrid },
          y: { scale: scaleLinear, nice: true, grid: prep.yGrid },
        },
        color: { domain: prep.metricKeys, range: prep.seriesColors },
        svgAnimation: prep.animation,
        tooltip,
      }),
    [prep, settings.labelColor],
  )

  return <Chart definition={definition} ariaLabel="Line chart" className="h-full min-h-0 w-full" />
}

function CartesianChartBody({
  rows,
  metrics,
  settings,
  colors,
}: {
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  colors: readonly string[]
}) {
  const horizontalBars = settings.kind === "bar" && settings.barDirection === "horizontal"
  if (horizontalBars) {
    return (
      <HorizontalBarChartBody rows={rows} metrics={metrics} settings={settings} colors={colors} />
    )
  }
  if (settings.kind === "bar") {
    return (
      <VerticalBarChartBody rows={rows} metrics={metrics} settings={settings} colors={colors} />
    )
  }
  if (settings.kind === "area") {
    return <AreaChartBody rows={rows} metrics={metrics} settings={settings} colors={colors} />
  }
  return <LineChartBody rows={rows} metrics={metrics} settings={settings} colors={colors} />
}

function PieChartBody({
  rows,
  metrics,
  settings,
  colors,
}: {
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  colors: readonly string[]
}) {
  const definition = useMemo(() => {
    const inputs: PieSliceInput[] = metrics.flatMap((metric) =>
      rows.flatMap((row) => {
        const value = row.values[metric.key]
        if (value === null || value === undefined || !Number.isFinite(value)) return []
        return [
          {
            id: `${metric.key}:${row.id}`,
            label: metrics.length === 1 ? row.label : `${row.label} · ${metric.label}`,
            value: Math.abs(value),
            metricKey: metric.key,
          },
        ]
      }),
    )
    const slices = pie(inputs, { value: "value", gapAngle: 0.015 })
    const totals = Object.fromEntries(
      metrics.map((metric) => [metric.key, totalForMetric(rows, metric.key)]),
    )
    const formatters = Object.fromEntries(
      metrics.map((metric) => [metric.key, metric.formatValue ?? formatDefault]),
    )
    const showLabels = settings.labelDisplay !== "none" && settings.pieLabelPosition !== "none"
    const labeledSlices = showLabels
      ? slices.map((slice) => ({
          ...slice,
          labelText: `${slice.label}: ${formatLabel(
            slice.value,
            totals[slice.metricKey] ?? 0,
            settings.labelDisplay,
            formatters[slice.metricKey] ?? formatDefault,
          )}`,
        }))
      : []
    const sliceIds = slices.map((slice) => slice.id)
    const sliceColors = slices.map((_, index) => colorAt(colors, index))
    const animation =
      settings.animationDuration > 0 ? { duration: settings.animationDuration } : false
    const radiusOffset =
      settings.pieLabelPosition === "outside"
        ? 18
        : settings.pieLabelPosition === "center"
          ? -56
          : -28

    return defineChart({
      marks: [
        polar({
          inset: 8,
          radiusRatio: 0.82,
          scales: {
            angle: { scale: scaleLinear().domain([0, Math.PI * 2]) },
            radius: { scale: scaleLinear().domain([0, 1]) },
          },
          marks: [
            radialArc(slices, {
              innerRadius: ({ radius }) => radius * 0.42,
              cornerRadius: 2,
              color: "id",
              key: "id",
              stroke: "var(--card)",
              strokeWidth: 1,
            }),
            ...(showLabels
              ? [
                  radialText(labeledSlices, {
                    angle: "angle",
                    radius: 1,
                    text: "labelText",
                    key: "id",
                    fill: settings.labelColor,
                    fontSize: 12,
                    anchor: settings.pieLabelPosition === "outside" ? "outside" : "middle",
                    radiusOffset,
                  }),
                ]
              : []),
          ],
        }),
      ],
      scales: { x: null, y: null },
      color: { domain: sliceIds, range: sliceColors },
      svgAnimation: animation,
      tooltip,
    })
  }, [rows, metrics, settings, colors])

  return <Chart definition={definition} ariaLabel="Pie chart" className="h-full min-h-0 w-full" />
}

export function CustomChartRenderer({
  title,
  description,
  data,
  metrics,
  settings,
  emptyMessage = "There is no data to chart yet.",
  tableInitiallyOpen = false,
  actions,
}: CustomChartRendererProps) {
  const generatedId = useId().replaceAll(":", "")
  const selectedMetrics = useMemo(() => {
    const selected = new Set(settings.metricKeys)
    return metrics.filter((metric) => selected.has(metric.key))
  }, [metrics, settings.metricKeys])
  const rowsWithValues = useMemo(
    () =>
      data.filter((row) =>
        selectedMetrics.some((metric) => {
          const value = row.values[metric.key]
          return value !== null && value !== undefined && Number.isFinite(value)
        }),
      ),
    [data, selectedMetrics],
  )
  const colors = palettes[settings.palette]
  const seriesColors = selectedMetrics.map(
    (metric, index) => metric.color ?? colorAt(colors, index),
  )
  const height =
    settings.size === "small"
      ? 200
      : settings.size === "medium"
        ? 300
        : settings.size === "large"
          ? 400
          : clampDimension(settings.height, 100, 800)
  const width =
    settings.width.mode === "custom"
      ? `${clampDimension(settings.width.value, 280, 1600)}px`
      : "100%"
  const noMetricMessage =
    selectedMetrics.length === 0
      ? "Select at least one metric to display this chart."
      : emptyMessage
  const hasChartData = selectedMetrics.length > 0 && rowsWithValues.length > 0
  const showTopLegend = settings.legend === "top"
  const showBottomLegend = settings.legend === "bottom"
  const showSideLegend = settings.legend === "left" || settings.legend === "right"

  return (
    <Card className="pt-0" aria-labelledby={`${generatedId}-title`}>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b py-5">
        <div className="min-w-0 space-y-1.5">
          <CardTitle id={`${generatedId}-title`}>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="space-y-4 px-2 pt-4 sm:px-6 sm:pt-6">
        {!hasChartData ? (
          <EmptyChart message={noMetricMessage} />
        ) : (
          <div className="max-w-full overflow-x-auto pb-1">
            <figure
              aria-labelledby={`${generatedId}-title`}
              style={{
                height,
                width,
                minWidth: settings.width.mode === "custom" ? width : undefined,
              }}
            >
              {showTopLegend && (
                <ChartLegend metrics={selectedMetrics} colors={seriesColors} placement="top" />
              )}
              <div
                className={
                  showSideLegend
                    ? `flex h-full min-h-0 gap-2 ${settings.legend === "left" ? "flex-row" : "flex-row-reverse"}`
                    : "h-full min-h-0"
                }
              >
                {showSideLegend && (
                  <ChartLegend
                    metrics={selectedMetrics}
                    colors={seriesColors}
                    placement={settings.legend}
                  />
                )}
                <div className="h-full min-h-0 flex-1">
                  {settings.kind === "pie" ? (
                    <PieChartBody
                      rows={rowsWithValues}
                      metrics={selectedMetrics}
                      settings={settings}
                      colors={colors}
                    />
                  ) : (
                    <CartesianChartBody
                      rows={rowsWithValues}
                      metrics={selectedMetrics}
                      settings={settings}
                      colors={seriesColors}
                    />
                  )}
                </div>
              </div>
              {showBottomLegend && (
                <ChartLegend metrics={selectedMetrics} colors={seriesColors} placement="bottom" />
              )}
              <figcaption className="sr-only">
                {title}. {rowsWithValues.length} data points across {selectedMetrics.length}{" "}
                metrics.
              </figcaption>
            </figure>
          </div>
        )}
        {data.length > 0 && selectedMetrics.length > 0 && (
          <AccessibleDataTable
            title={title}
            rows={data}
            metrics={selectedMetrics}
            initiallyOpen={tableInitiallyOpen}
          />
        )}
      </CardContent>
    </Card>
  )
}

export const chartPalettes = palettes
