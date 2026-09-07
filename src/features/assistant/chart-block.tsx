// Assistant chart fence spec (AI-SDK-generative-UI pattern, adapted to our stack).
//
// Fenced block:
//
// ```budgetlens-chart
// {
//   "type": "bar" | "donut" | "line",
//   "title": "Spending by category",
//   "unit": "$",
//   "data": [{ "label": "Groceries", "value": 1141 }]
// }
// ```
//
// Rules:
// - `type` is exactly "bar", "donut", or "line" ("line" is for trends over
//   time: points render left-to-right in the given order).
// - `title` is a non-empty string (1..120 chars after trimming).
// - `unit` is optional; when present it must be a string (1..24 chars after
//   trimming, e.g. "$"). Empty/whitespace-only units are treated as absent.
// - `data` has 1..12 slices; each slice is { label: 1..40 chars, value: finite
//   number }. Bar lengths and donut fractions use |value| so negative finance
//   totals still chart; displayed values keep their sign. Line charts scale to
//   the data min/max (flat line when all values are equal).
// - Anything else -> ChartBlock renders a friendly fallback box, never throws.
// - Existing dashboard chart infra (src/features/charts, recharts-based
//   CustomChartRenderer) was intentionally NOT reused: it needs dashboard
//   configuration objects and recharts, which is too heavy for inline
//   assistant answers. This file is dependency-free SVG.

export interface BudgetLensChartDatum {
  label: string
  value: number
}

export interface BudgetLensChartSpec {
  type: "bar" | "donut" | "line"
  title: string
  data: readonly BudgetLensChartDatum[]
  unit?: string
}

const MAX_SLICES = 12

const PALETTE: readonly string[] = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ca8a04",
  "#4f46e5",
  "#0d9488",
  "#ea580c",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? "#2563eb"
}

function formatChartValue(value: number, unit: string | undefined): string {
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
  return unit ? `${formatted} ${unit}` : formatted
}

export function parseBudgetLensChartSpec(input: unknown): BudgetLensChartSpec | null {
  if (!isRecord(input)) return null
  const rawType = input["type"]
  const chartType = rawType === "bar" || rawType === "donut" || rawType === "line" ? rawType : null
  if (chartType === null) return null

  const rawTitle = input["title"]
  if (typeof rawTitle !== "string") return null
  const title = rawTitle.trim()
  if (title.length === 0 || title.length > 120) return null

  const rawUnit = input["unit"]
  let unit: string | undefined
  if (rawUnit !== undefined) {
    if (typeof rawUnit !== "string") return null
    const trimmedUnit = rawUnit.trim()
    if (trimmedUnit.length > 24) return null
    unit = trimmedUnit.length === 0 ? undefined : trimmedUnit
  }

  const rawData = input["data"]
  if (!Array.isArray(rawData)) return null
  if (rawData.length === 0 || rawData.length > MAX_SLICES) return null
  const data: BudgetLensChartDatum[] = []
  for (const entry of rawData) {
    if (!isRecord(entry)) return null
    const rawLabel = entry["label"]
    if (typeof rawLabel !== "string") return null
    const label = rawLabel.trim()
    if (label.length === 0 || label.length > 40) return null
    const value = entry["value"]
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    data.push({ label, value })
  }

  if (unit === undefined) {
    return { type: chartType, title, data }
  }
  return { type: chartType, title, data, unit }
}

function ChartFallback({ title }: { title?: string }) {
  return (
    <div
      role="note"
      aria-label={title ? `Chart unavailable: ${title}` : "Chart unavailable"}
      className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground"
    >
      Chart unavailable — the model returned data this chart could not display.
    </div>
  )
}

function ChartDataTable({ spec }: { spec: BudgetLensChartSpec }) {
  return (
    <details className="rounded-xl border bg-muted/20">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
        View chart data as a table
      </summary>
      <div className="overflow-x-auto border-t">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Data shown in {spec.title}</caption>
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th scope="col" className="p-2 font-medium">
                Label
              </th>
              <th scope="col" className="p-2 text-right font-medium">
                Value{spec.unit ? ` (${spec.unit})` : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {spec.data.map((row, index) => {
              const rowKey = `row-${index}-${row.label}`
              return (
                <tr className="border-b last:border-0" key={rowKey}>
                  <th scope="row" className="p-2 text-left font-normal">
                    {row.label}
                  </th>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {formatChartValue(row.value, spec.unit)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function BarChartSvg({ spec }: { spec: BudgetLensChartSpec }) {
  const magnitudes = spec.data.map((row) => Math.abs(row.value))
  const max = magnitudes.reduce((acc, mag) => (mag > acc ? mag : acc), 0)
  const rowHeight = 34
  const height = spec.data.length * rowHeight + 12
  const barX = 118
  const barMaxWidth = 140
  const valueX = barX + barMaxWidth + 8

  return (
    <svg
      viewBox={`0 0 360 ${height}`}
      className="h-auto w-full"
      aria-label={`${spec.title}: ${spec.data.length} categories`}
    >
      <title>{spec.title}</title>
      {spec.data.map((row, index) => {
        const magnitude = magnitudes[index] ?? 0
        const fraction = max > 0 ? magnitude / max : 0
        const y = 6 + index * rowHeight
        const centerY = y + 11
        const shortLabel = row.label.length > 16 ? `${row.label.slice(0, 15)}…` : row.label
        const barKey = `bar-${index}-${row.label}`
        return (
          <g key={barKey}>
            <title>{`${row.label}: ${formatChartValue(row.value, spec.unit)}`}</title>
            <text x={0} y={centerY} fontSize={11} fill="currentColor" dominantBaseline="central">
              {shortLabel}
            </text>
            <rect
              x={barX}
              y={y + 2}
              width={Math.max(2, fraction * barMaxWidth)}
              height={14}
              rx={4}
              fill={colorFor(index)}
            />
            <text
              x={valueX}
              y={centerY}
              fontSize={11}
              fill="currentColor"
              dominantBaseline="central"
              className="tabular-nums"
            >
              {formatChartValue(row.value, spec.unit)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function DonutChartSvg({ spec }: { spec: BudgetLensChartSpec }) {
  const magnitudes = spec.data.map((row) => Math.abs(row.value))
  const total = magnitudes.reduce((acc, mag) => acc + mag, 0)
  if (total <= 0) return null
  let cumulative = 0
  const slices = spec.data.map((row, index) => {
    const magnitude = magnitudes[index] ?? 0
    const fraction = magnitude / total
    const start = cumulative
    cumulative += fraction
    return { label: row.label, value: row.value, fraction, start, color: colorFor(index) }
  })

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox="0 0 42 42"
        className="h-44 w-44"
        aria-label={`${spec.title}: ${spec.data.length} slices`}
      >
        <title>{spec.title}</title>
        <circle
          cx={21}
          cy={21}
          r={15.915}
          fill="transparent"
          strokeWidth={7}
          stroke="var(--muted)"
        />
        {slices.map((slice, index) => {
          const circleKey = `circle-${index}-${slice.label}`
          return (
            <circle
              key={circleKey}
              cx={21}
              cy={21}
              r={15.915}
              fill="transparent"
              strokeWidth={7}
              stroke={slice.color}
              strokeDasharray={`${slice.fraction * 100} ${100 - slice.fraction * 100}`}
              strokeDashoffset={25 - slice.start * 100}
            >
              <title>{`${slice.label}: ${formatChartValue(slice.value, spec.unit)}`}</title>
            </circle>
          )
        })}
      </svg>
      <ul className="w-full space-y-1">
        {slices.map((slice, index) => {
          const legendKey = `legend-${index}-${slice.label}`
          return (
            <li key={legendKey} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="min-w-0 flex-1 truncate">{slice.label}</span>
              <span className="font-mono tabular-nums">
                {formatChartValue(slice.value, spec.unit)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LineChartSvg({ spec }: { spec: BudgetLensChartSpec }) {
  const width = 360
  const height = 180
  const padLeft = 8
  const padRight = 8
  const padTop = 10
  const padBottom = 22
  const values = spec.data.map((row) => row.value)
  const min = values.reduce((acc, value) => (value < acc ? value : acc), values[0] ?? 0)
  const max = values.reduce((acc, value) => (value > acc ? value : acc), values[0] ?? 0)
  const span = max - min
  // Overflow-safe: extreme finite values (e.g. ±Number.MAX_VALUE) subtract to
  // Infinity, which would poison every coordinate with NaN. Fall back to the
  // flat middle line exactly like the all-equal case.
  const safeSpan = Number.isFinite(span) && span !== 0 ? span : 0
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom
  const points = spec.data.map((row, index) => {
    const x =
      spec.data.length === 1
        ? padLeft + plotWidth / 2
        : padLeft + (index / (spec.data.length - 1)) * plotWidth
    const y =
      safeSpan === 0
        ? padTop + plotHeight / 2
        : padTop + plotHeight - ((row.value - min) / safeSpan) * plotHeight
    return { x, y, row }
  })
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ")
  const firstLabel = spec.data[0]?.label ?? ""
  const lastLabel = spec.data.length > 1 ? (spec.data[spec.data.length - 1]?.label ?? "") : ""

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      aria-label={`${spec.title}: trend over ${spec.data.length} points`}
    >
      <title>{spec.title}</title>
      <line
        x1={padLeft}
        y1={padTop + plotHeight}
        x2={padLeft + plotWidth}
        y2={padTop + plotHeight}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {span === 0 || spec.data.length === 1 ? null : (
        <text x={padLeft} y={padTop - 2} fontSize={10} fill="currentColor" className="tabular-nums">
          {formatChartValue(max, spec.unit)}
        </text>
      )}
      <path
        d={path}
        fill="none"
        stroke={colorFor(0)}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point) => (
        <circle
          key={`dot-${point.x.toFixed(1)}-${point.row.label}`}
          cx={point.x}
          cy={point.y}
          r={3}
          fill={colorFor(0)}
        >
          <title>{`${point.row.label}: ${formatChartValue(point.row.value, spec.unit)}`}</title>
        </circle>
      ))}
      <text x={padLeft} y={height - 6} fontSize={10} fill="currentColor">
        {firstLabel.length > 14 ? `${firstLabel.slice(0, 13)}…` : firstLabel}
      </text>
      {lastLabel && lastLabel !== firstLabel ? (
        <text
          x={padLeft + plotWidth}
          y={height - 6}
          fontSize={10}
          fill="currentColor"
          textAnchor="end"
        >
          {lastLabel.length > 14 ? `${lastLabel.slice(0, 13)}…` : lastLabel}
        </text>
      ) : null}
    </svg>
  )
}

export function ChartBlock({ spec }: { spec: unknown }) {
  const parsed = parseBudgetLensChartSpec(spec)
  if (parsed === null) {
    return <ChartFallback />
  }
  if (parsed.type === "donut") {
    const total = parsed.data.reduce((acc, row) => acc + Math.abs(row.value), 0)
    if (total <= 0) {
      return <ChartFallback title={parsed.title} />
    }
  }
  return (
    <figure
      aria-label={parsed.title}
      className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
    >
      <figcaption className="text-sm font-medium">{parsed.title}</figcaption>
      {parsed.type === "bar" ? (
        <BarChartSvg spec={parsed} />
      ) : parsed.type === "line" ? (
        <LineChartSvg spec={parsed} />
      ) : (
        <DonutChartSvg spec={parsed} />
      )}
      <ChartDataTable spec={parsed} />
    </figure>
  )
}
