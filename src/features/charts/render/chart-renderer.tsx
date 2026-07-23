import { useId, useMemo, type ReactNode } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  type PieLabelRenderProps,
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

function pieLabel(
  props: PieLabelRenderProps,
  display: ChartLabelDisplay,
  color: string,
  position: Exclude<PieLabelPosition, "none">,
) {
  const value = props.value
  const percent = props.percent ?? 0
  const radius =
    position === "center"
      ? 0
      : position === "inside"
        ? (props.innerRadius + props.outerRadius) / 2
        : props.outerRadius + 18
  const radians = (-(props.midAngle ?? 0) * Math.PI) / 180
  const x = props.cx + radius * Math.cos(radians)
  const y = props.cy + radius * Math.sin(radians)
  const detail =
    display === "value"
      ? formatDefault(value)
      : display === "percent"
        ? `${(percent * 100).toFixed(1)}%`
        : `${formatDefault(value)} · ${(percent * 100).toFixed(1)}%`
  return (
    <text
      x={x}
      y={y}
      fill={color}
      textAnchor={position === "center" ? "middle" : x > props.cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={12}
    >
      {props.name ?? "Value"}: {detail}
    </text>
  )
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

interface ChartBodyProps {
  rows: readonly ChartDataRow[]
  metrics: readonly ChartMetric[]
  settings: ChartPresentationSettings
  colors: readonly string[]
  config: ChartConfig
}

function CartesianChartBody({ rows, metrics, settings, colors, config }: ChartBodyProps) {
  const gradientId = useId().replaceAll(":", "")
  const chartData = rows.map((row) => ({ name: row.label, ...row.values }))
  const totals = Object.fromEntries(
    metrics.map((metric) => [metric.key, totalForMetric(rows, metric.key)]),
  )
  const horizontalBars = settings.kind === "bar" && settings.barDirection === "horizontal"
  const legendAlign =
    settings.legend === "left" ? "left" : settings.legend === "right" ? "right" : "center"
  const sideLegend = settings.legend === "left" || settings.legend === "right"
  const legendVerticalAlign = sideLegend ? "middle" : settings.legend === "top" ? "top" : "bottom"
  const common = {
    responsive: true,
    data: chartData,
    style: { width: "100%", height: "100%" },
    margin: { top: settings.labelDisplay === "none" ? 12 : 28, right: 20, bottom: 8, left: 12 },
    accessibilityLayer: true,
  } as const
  const grid =
    settings.grid === "none" ? null : (
      <CartesianGrid
        horizontal={settings.grid === "horizontal" || settings.grid === "both"}
        vertical={settings.grid === "vertical" || settings.grid === "both"}
      />
    )
  const axes = horizontalBars ? (
    <>
      <XAxis type="number" tickLine={false} axisLine={false} />
      <YAxis dataKey="name" type="category" width="auto" tickLine={false} axisLine={false} />
    </>
  ) : (
    <>
      <XAxis dataKey="name" minTickGap={24} tickMargin={8} tickLine={false} axisLine={false} />
      <YAxis width="auto" tickLine={false} axisLine={false} />
    </>
  )
  const tooltip = (
    <Tooltip
      content={<ChartTooltipContent />}
      cursor={
        settings.kind === "area"
          ? false
          : { fill: "color-mix(in oklab, var(--muted) 65%, transparent)" }
      }
    />
  )
  const legend =
    settings.legend === "hidden" ? null : (
      <Legend
        content={<ChartLegendContent />}
        align={legendAlign}
        verticalAlign={legendVerticalAlign}
        layout={sideLegend ? "vertical" : "horizontal"}
      />
    )

  if (settings.kind === "bar") {
    return (
      <ChartContainer config={config} className="h-full min-h-0">
        <BarChart {...common} layout={horizontalBars ? "vertical" : "horizontal"}>
          {grid}
          {axes}
          {tooltip}
          {legend}
          {metrics.map((metric, index) => (
            <Bar
              dataKey={metric.key}
              fill={colorAt(colors, index)}
              key={metric.key}
              name={metric.label}
              radius={horizontalBars ? [0, 5, 5, 0] : [5, 5, 0, 0]}
              isAnimationActive={settings.animationDuration > 0}
              animationDuration={settings.animationDuration}
            >
              {settings.labelDisplay !== "none" && (
                <LabelList
                  position={horizontalBars ? "right" : "top"}
                  fill={settings.labelColor}
                  formatter={(value: unknown) =>
                    formatLabel(
                      Number(value ?? 0),
                      totals[metric.key] ?? 0,
                      settings.labelDisplay,
                      metric.formatValue ?? formatDefault,
                    )
                  }
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    )
  }

  if (settings.kind === "area") {
    return (
      <ChartContainer config={config} className="h-full min-h-0">
        <AreaChart {...common}>
          <defs>
            {metrics.map((metric, index) => (
              <linearGradient
                id={`area-${gradientId}-${index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
                key={metric.key}
              >
                <stop offset="5%" stopColor={`var(--color-${metric.key})`} stopOpacity={0.8} />
                <stop offset="95%" stopColor={`var(--color-${metric.key})`} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          {grid}
          {axes}
          {tooltip}
          {legend}
          {metrics.map((metric, index) => (
            <Area
              dataKey={metric.key}
              key={metric.key}
              name={metric.label}
              type="natural"
              stroke={`var(--color-${metric.key})`}
              fill={
                settings.areaFill === "gradient"
                  ? `url(#area-${gradientId}-${index})`
                  : settings.areaFill === "solid"
                    ? `var(--color-${metric.key})`
                    : "transparent"
              }
              fillOpacity={
                settings.areaFill === "solid" ? 0.18 : settings.areaFill === "none" ? 0 : 1
              }
              strokeWidth={2}
              connectNulls
              isAnimationActive={settings.animationDuration > 0}
              animationDuration={settings.animationDuration}
            >
              {settings.labelDisplay !== "none" && (
                <LabelList
                  position="top"
                  fill={settings.labelColor}
                  formatter={(value: unknown) =>
                    formatLabel(
                      Number(value ?? 0),
                      totals[metric.key] ?? 0,
                      settings.labelDisplay,
                      metric.formatValue ?? formatDefault,
                    )
                  }
                />
              )}
            </Area>
          ))}
        </AreaChart>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer config={config} className="h-full min-h-0">
      <LineChart {...common}>
        {grid}
        {axes}
        {tooltip}
        {legend}
        {metrics.map((metric, index) => (
          <Line
            dataKey={metric.key}
            key={metric.key}
            name={metric.label}
            type="monotone"
            stroke={colorAt(colors, index)}
            strokeWidth={2.5}
            dot={{ r: 3, fill: colorAt(colors, index) }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={settings.animationDuration > 0}
            animationDuration={settings.animationDuration}
          >
            {settings.labelDisplay !== "none" && (
              <LabelList
                position="top"
                fill={settings.labelColor}
                formatter={(value: unknown) =>
                  formatLabel(
                    Number(value ?? 0),
                    totals[metric.key] ?? 0,
                    settings.labelDisplay,
                    metric.formatValue ?? formatDefault,
                  )
                }
              />
            )}
          </Line>
        ))}
      </LineChart>
    </ChartContainer>
  )
}

function PieChartBody({ rows, metrics, settings, colors, config }: ChartBodyProps) {
  const slices = metrics.flatMap((metric) => {
    const metricTotal = totalForMetric(rows, metric.key)
    return rows.flatMap((row) => {
      const value = row.values[metric.key]
      if (value === null || value === undefined) return []
      return [
        {
          id: `${metric.key}:${row.id}`,
          name: metrics.length === 1 ? row.label : `${row.label} · ${metric.label}`,
          value: Math.abs(value),
          originalValue: value,
          metric,
          metricTotal,
        },
      ]
    })
  })

  return (
    <ChartContainer config={config} className="h-full min-h-0">
      <PieChart
        responsive
        style={{ width: "100%", height: "100%" }}
        margin={{ top: 16, right: 20, bottom: 16, left: 20 }}
        accessibilityLayer
      >
        <Tooltip content={<ChartTooltipContent />} />
        {settings.legend !== "hidden" && (
          <Legend
            align={
              settings.legend === "left" ? "left" : settings.legend === "right" ? "right" : "center"
            }
            verticalAlign={
              settings.legend === "left" || settings.legend === "right"
                ? "middle"
                : settings.legend === "top"
                  ? "top"
                  : "bottom"
            }
            layout={
              settings.legend === "left" || settings.legend === "right" ? "vertical" : "horizontal"
            }
          />
        )}
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          innerRadius="42%"
          outerRadius="76%"
          paddingAngle={1}
          isAnimationActive={settings.animationDuration > 0}
          animationDuration={settings.animationDuration}
          labelLine={settings.labelDisplay !== "none" && settings.pieLabelPosition === "outside"}
          label={
            settings.labelDisplay === "none" || settings.pieLabelPosition === "none"
              ? false
              : (props: PieLabelRenderProps) =>
                  pieLabel(
                    props,
                    settings.labelDisplay,
                    settings.labelColor,
                    settings.pieLabelPosition === "none" ? "outside" : settings.pieLabelPosition,
                  )
          }
        >
          {slices.map((slice, index) => (
            <Cell fill={colorAt(colors, index)} key={slice.id} stroke="var(--card)" />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
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
  const config = Object.fromEntries(
    selectedMetrics.map((metric, index) => [
      metric.key,
      { label: metric.label, color: colorAt(seriesColors, index) },
    ]),
  ) satisfies ChartConfig
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
              {settings.kind === "pie" ? (
                <PieChartBody
                  rows={rowsWithValues}
                  metrics={selectedMetrics}
                  settings={settings}
                  colors={colors}
                  config={config}
                />
              ) : (
                <CartesianChartBody
                  rows={rowsWithValues}
                  metrics={selectedMetrics}
                  settings={settings}
                  colors={seriesColors}
                  config={config}
                />
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
