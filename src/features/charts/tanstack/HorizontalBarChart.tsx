import { useMemo } from "react"
import {
  Chart,
  BarX,
  Guide,
  CategoricalScale,
  LinearScale,
  Tooltip,
  CartesianView,
} from "@tanstack/react-charts"
import { formatMoney } from "@/features/dashboard/format"

interface HorizontalBarChartProps {
  data: readonly {
    label: string
    value: number
    color?: string
  }[]
  height?: number
  showTooltip?: boolean
  indexLabel?: string
  valueLabel?: string
}

export function HorizontalBarChart({
  data,
  height = 300,
  showTooltip = true,
  indexLabel = "Category",
  valueLabel = "Amount",
}: HorizontalBarChartProps) {
  const chartData = useMemo(() => {
    if (!data.length) return []
    return data
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, index: i }))
  }, [data])

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value), 0), [data])

  const xScale = useMemo(
    () => LinearScale({ range: [0, 1], domain: [0, maxValue] }),
    [maxValue],
  )

  const yScale = useMemo(
    () =>
      CategoricalScale({
        domain: data.map((d) => d.label),
        range: [1, 0],
        padding: 0.2,
      }),
    [data],
  )

  return (
    <Chart width="100%" height={Math.max(height, data.length * 40 + 60)}>
      <CartesianView
        xScale={{ scale: LinearScale({ range: [0, 1], domain: [0, maxValue] }), }}
        yScale={{ scale: CategoricalScale({ domain: data.map((d) => d.label), range: [1, 0], padding: 0.2 }), }}
        margin={{ top: 10, right: 10, bottom: 40, left: 120 }}
      >
        <Guide.YAxis position="left" ticks={data.length} />
        <Guide.XAxis
          position="bottom"
          format={(value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value as number)}
          ticks={5}
        />
        <Guide.Grid lines={{ x: true, y: false }} />
        <Tooltip
          formatX={(value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value as number)}
          formatY={(value) => value}
        />
      </CartesianView>
    </Chart>
  )
}