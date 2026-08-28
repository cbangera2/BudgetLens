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

interface WaterfallChartProps {
  data: readonly {
    label: string
    value: number
    type: "income" | "expense" | "subtotal"
  }[]
  height?: number
  showTooltip?: boolean
}

const colorMap = {
  income: "var(--chart-income)",
  expense: "var(--chart-expense)",
  subtotal: "var(--chart-primary)",
}

export function WaterfallChart({
  data,
  height = 300,
  showTooltip = true,
}: WaterfallChartProps) {
  const chartData = useMemo(() => {
    let running = 0
    return data.map((d, i) => {
      const start = running
      const end = running + d.value
      running = end
      return { ...d, start, end, index: i }
    })
  }, [data])

  const maxValue = Math.max(...data.flatMap((d) => [d.value, 0]), 0)
  const minValue = Math.min(...data.flatMap((d) => [d.value, 0]), 0)

  const maxAbs = Math.max(Math.abs(Math.max(...data.map((d) => d.value), 0)), Math.abs(Math.min(...data.map((d) => d.value), 0)))

  const xScale = LinearScale({ range: [0, 1], domain: [-maxValue * 1.1, maxValue * 1.1] })
  const yScale = CategoricalScale({
    domain: data.map((d, i) => `${d.label} (${i})`),
    range: [1, 0],
    padding: 0.3,
  })

  return (
    <Chart width="100%" height={Math.max(300, data.length * 50 + 60)}>
      <CartesianView
        xScale={{ scale: LinearScale({ range: [0, 1], domain: [-maxValue * 1.2, maxValue * 1.2]) }, }}
        yScale={{ scale: CategoricalScale({ domain: data.map((d, i) => `${d.label} (${i})`), range: [1, 0], padding: 0.3 }), }}
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
              key={d.label}
              data={[{ x: d.start, y: `${d.label} (${d.index})` }]}
              x={(d) => d.x}
              y={(d) => d.y}
              fill={colorMap[d.type] || "var(--chart-primary)"}
              height={0.6}
              x={(d) => d.x}
              y={(d) => d.y}
            />
            {d.type === "subtotal" && (
              <Text
                x={d.end}
                y={`${d.label} (${d.index})`}
                fill="var(--foreground)"
                fontSize={11}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatMoney(d.value)}
              </Text>
            )}
          </>
        ))}
        <Tooltip formatX={(value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value as number)} />
      </CartesianView>
    </Chart>
  )
}