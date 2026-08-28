import { useMemo } from "react"
import {
  Chart,
  AreaY,
  Guide,
  Scale,
  CategoricalScale,
  LinearScale,
  TimeScale,
  Tooltip,
  CartesianView,
} from "@tanstack/react-charts"
import { formatMoney } from "@/features/dashboard/format"

interface StackedAreaChartProps {
  data: readonly {
    date: string
    income?: number
    expenses?: number
    savings?: number
  }[]
  height?: number
  showTooltip?: boolean
}

const colorMap = {
  income: "var(--chart-income)",
  expenses: "var(--chart-expense)",
  savings: "var(--chart-savings)",
}

const metricKeys = ["income", "expenses", "savings"] as const

export function StackedAreaChart({
  data,
  height = 300,
  showTooltip = true,
}: StackedAreaChartProps) {
  const chartData = useMemo(() => {
    if (!data.length) return []
    return data.map((point) => ({
      date: new Date(point.date),
      income: point.income ?? 0,
      expenses: point.expenses ?? 0,
      savings: point.savings ?? 0,
    }))
  }, [data])

  const maxValue = useMemo(() => {
    if (!chartData.length) return 1000
    return Math.max(
      ...chartData.flatMap((d) =>
        metricKeys.map((key) => d[key] ?? 0),
      ),
    )
  }, [chartData])

  const xScale = useMemo(() => TimeScale({ range: [0, 1] }), [])
  const yScale = useMemo(() => LinearScale({ range: [1, 0], domain: [0, maxValue] }), [maxValue])
  const colorScale = useMemo(
    () =>
      CategoricalScale({
        domain: metricKeys,
        range: metricKeys.map((k) => colorMap[k]),
      }),
    [],
  )

  const series = useMemo(
    () =>
      metricKeys.map((key) => ({
        key,
        data: chartData.map((d) => ({
          x: d.date,
          y: d[key] ?? 0,
        })),
        label: key,
        color: colorMap[key],
      }),
    ),
    [chartData],
  )

  return (
    <Chart width="100%" height={height}>
      <CartesianView xScale={xScale} yScale={yScale} margin={{ top: 10, right: 10, bottom: 40, left: 50 }}>
        <Guide.XAxis
          position="bottom"
          format={(value) => new Date(value as number).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
          ticks={6}
        />
        <Guide.YAxis
          position="left"
          format={(value) => formatMoney(value as number)}
          ticks={5}
        />
        <Guide.Grid lines={{ x: false, y: true }} />
        {series.map((s) => (
          <AreaY
            key={s.key}
            data={s.data}
            x={(d) => d.x}
            y={(d) => d.y}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.3}
            strokeWidth={2}
            curve="monotoneX"
            xScale={xScale}
            yScale={yScale}
            x={(d) => d.x}
            y={(d) => d.y}
          />
        ))}
        {showTooltip && <Tooltip />}
      </CartesianView>
    </Chart>
  )
}