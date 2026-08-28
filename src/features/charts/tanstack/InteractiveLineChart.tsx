import { useMemo, useState } from "react"
import {
  Chart,
  LineY,
  DotY,
  Guide,
  Scale,
  CategoricalScale,
  LinearScale,
  TimeScale,
  Tooltip,
  CartesianView,
  BrushX,
} from "@tanstack/react-charts"
import { formatMoney } from "@/features/dashboard/format"

interface InteractiveLineChartProps {
  data: readonly {
    date: string
    netWorth?: number
    investment?: number
  }[]
  height?: number
  showTooltip?: boolean
  brushable?: boolean
}

const colorMap = {
  netWorth: "var(--chart-net-worth)",
  investment: "var(--chart-investment)",
}

const metricKeys = ["netWorth", "investment"] as const

export function InteractiveLineChart({
  data,
  height = 300,
  showTooltip = true,
  brushable = true,
}: InteractiveLineChartProps) {
  const [brushRange, setBrushRange] = useState<{ start: Date; end: Date } | null>(null)

  const chartData = useMemo(() => {
    if (!data.length) return []
    return data
      .map((point) => ({
        date: new Date(point.date),
        netWorth: point.netWorth ?? 0,
        investment: point.investment ?? 0,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [data])

  const allValues = useMemo(() => {
    const values = chartData.flatMap((d) => metricKeys.map((k) => d[k] ?? 0))
    return values.filter((v): v is number => v !== undefined)
  }, [chartData])

  const maxValue = useMemo(() => Math.max(...allValues, 0), [allValues])
  const minValue = useMemo(() => Math.min(...allValues, 0), [allValues])

  const xScale = useMemo(
    () =>
      TimeScale({
        range: [0, 1],
        domain: brushRange ? [brushRange.start, brushRange.end] : undefined,
      }),
    [brushRange],
  )

  const yScale = useMemo(
    () => LinearScale({ range: [1, 0], domain: [Math.min(minValue, 0), maxValue] }),
    [maxValue, minValue],
  )

  const colorScale = useMemo(
    () =>
      CategoricalScale({
        domain: ["netWorth", "investment"],
        range: ["var(--chart-net-worth)", "var(--chart-investment)"],
      }),
    [],
  )

  const series = useMemo(
    () =>
      (["netWorth", "investment"] as const).map((key) => ({
        key,
        data: chartData.map((d) => ({
          x: d.date,
          y: d[key] ?? 0,
        })),
        label: key,
        color: colorMap[key],
      }),
    [chartData],
  );

  const onBrushEnd = (range: { start: number; end: number }) => {
    if (range.start === range.end) {
      setBrushRange(null)
    } else {
      setBrushRange({ start: new Date(range.start), end: new Date(range.end) })
    }
  }

  const handleRowClick = (event: React.MouseEvent, id: string) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, a, input, select, label")
    )
      return
    const checked = !selected.has(id)
    toggleRow(id, checked, event)
  }

  return (
    <Chart width="100%" height={height}>
      <CartesianView
        xScale={{ scale: xScale }}
        yScale={{ scale: yScale }}
        margin={{ top: 10, right: 10, bottom: 40, left: 50 }}
      >
        <Guide.XAxis
          position="bottom"
          format={(value) => new Date(value as number).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
          ticks={6}
        />
        <Guide.YAxis
          position="left"
          format={(value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value as number)}
          ticks={5}
        />
        <Guide.Grid lines={{ x: false, y: true }} />
        {series.map((s) => (
          <LineY
            key={s.key}
            data={s.data}
            x={(d) => d.x}
            y={(d) => d.y}
            stroke={s.color}
            strokeWidth={2}
            curve="monotoneX"
            x={(d) => d.x}
            y={(d) => d.y}
          />
        ))}
        <DotY
          data={series.flatMap((s) => s.data)}
          x={(d) => d.x}
          y={(d) => d.y}
          r={4}
          fill="white"
          strokeWidth={2}
        />
        <Tooltip
          formatX={(value) => new Date(value as number).toLocaleDateString()}
          formatY={(value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value as number)}
        />
      </CartesianView>
      {brushable && (
        <BrushX
          scale={TimeScale({ range: [0, 1] })}
          onBrushEnd={onBrushEnd}
          style={{ cursor: "crosshair" }}
        />
      )}
    </Chart>
  )
}