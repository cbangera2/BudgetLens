import { useMemo } from "react"
import {
  Chart,
  BarY,
  Guide,
  CategoricalScale,
  LinearScale,
  Tooltip,
  CartesianView,
  Text,
} from "@tanstack/react-charts"
import { formatMoney } from "@/features/dashboard/format"
import { cn } from "@/lib/cn"

interface BudgetVsActualChartProps {
  data: readonly {
    label: string
    budgeted: number
    actual: number
    category?: string
  }[]
  height?: number
  showTooltip?: boolean
}

const budgetColor = "var(--chart-primary)"
const actualColor = "var(--chart-accent)"

export function BudgetVsActualChart({
  data,
  height = 300,
  showTooltip = true,
}: BudgetVsActualChartProps) {
  const chartData = useMemo(() => {
    if (!data.length) return []
    return data.map((d, i) => ({ ...d, index: i }))
  }, [data])

  const maxValue = Math.max(
    ...data.flatMap((d) => [d.budgeted, d.actual]),
    0,
  )

  const yScale = CategoricalScale({
    domain: data.map((d) => d.label),
    range: [1, 0],
    padding: 0.3,
  })

  const xScale = LinearScale({ range: [0, 1], domain: [0, maxValue] })

  return (
    <Chart width="100%" height={Math.max(300, data.length * 50 + 60)}>
      <CartesianView
        xScale={{ scale: LinearScale({ range: [0, 1], domain: [0, maxValue] }), }}
        yScale={{ scale: yScale }}
        margin={{ top: 10, right: 10, bottom: 40, left: 120 }}
      >
        <Guide.YAxis position="left" ticks={data.length} />
        <Guide.XAxis
          position="bottom"
          format={(value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value as number)}
          ticks={5}
        />
        <Guide.Grid lines={{ x: true, y: false }} />
        {data.map((d) => (
          <>
            <BarY
              key={d.label + "-budget"}
              data={[{ x: d.budgeted, y: d.label }]}
              x={(d) => d.x}
              y={(d) => d.y}
              fill={budgetColor}
              height={0.35}
              offset={0}
              x={(d) => d.x}
              y={(d) => d.y}
            />
            <BarY
              key={d.label + "-actual"}
              data={[{ x: d.actual, y: d.label }]}
              x={(d) => d.x}
              y={(d) => d.y}
              fill={actualColor}
              height={0.35}
              offset={0.35}
              x={(d) => d.x}
              y={(d) => d.y}
            />
            <Text
              x={Math.max(d.budgeted, d.actual) + maxValue * 0.02}
              y={d.label}
              fill="var(--muted-foreground)"
              fontSize={11}
              textAnchor="start"
              dominantBaseline="middle"
            >
              {d.budgeted >= 0 ? "+" : ""}{formatMoney(d.actual - d.budgeted)}
            </Text>
          </>
        ))}
        <Tooltip formatX={(value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value as number)} />
      </CartesianView>
    </Chart>
  )
}