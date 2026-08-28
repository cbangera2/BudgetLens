import { useMemo } from "react"
import {
  Chart,
  BarY,
  RuleY,
  Guide,
  CategoricalScale,
  LinearScale,
  Tooltip,
  CartesianView,
  Text,
} from "@tanstack/react-charts"
import { formatMoney } from "@/features/dashboard/format"
import { cn } from "@/lib/cn"

interface BulletChartProps {
  data: readonly {
    label: string
    actual: number
    target: number
    ranges: {
      poor: number
      fair: number
      good: number
    }
    color?: string
  }[]
  height?: number
  orientation?: "horizontal" | "vertical"
  reverse?: boolean
}

export function BulletChart({
  data,
  height = 200,
  orientation = "horizontal",
}: BulletChartProps) {
  const maxValue = useMemo(
    () => Math.max(...data.flatMap((d) => [d.actual, d.target, d.ranges.good, d.ranges.fair, d.ranges.poor]), 0),
    [data],
  )

  return (
    <div className="grid gap-6">
      {data.map((item, idx) => (
        <div key={item.label} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{item.label}</span>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Actual: {formatMoney(item.actual)}</span>
              <span>Target: {formatMoney(item.target)}</span>
            </div>
          </div>
          <Chart width="100%" height={60}>
            <CartesianView
              xScale={{
                scale: LinearScale({
                  range: [0, 1],
                  domain: [0, Math.max(item.ranges.good, item.target, item.actual) * 1.1],
                }),
              }}
              yScale={{
                scale: CategoricalScale({ range: [1, 0], padding: 0.5 }),
              }}
              margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
            >
              <Guide.Grid lines={{ x: true, y: false }} />
              <BarY
                data={[{ x: item.ranges.poor, y: 0 }]}
                x={(d) => d.x}
                y={(d) => d.y}
                fill="var(--destructive)"
                opacity={0.3}
                height={0.8}
                x={(d) => d.x}
                y={(d) => d.y}
              />
              <BarY
                data={[{ x: item.ranges.fair, y: 0 }]}
                x={(d) => d.x}
                y={(d) => d.y}
                fill="var(--warning)"
                opacity={0.3}
                height={0.8}
                x={(d) => d.x}
                y={(d) => d.y}
              />
              <BarY
                data={[{ x: item.ranges.good, y: 0 }]}
                x={(d) => d.x}
                y={(d) => d.y}
                fill="var(--success)"
                opacity={0.3}
                height={0.8}
                x={(d) => d.x}
                y={(d) => d.y}
              />
              <BarY
                data={[{ x: item.actual, y: 0 }]}
                x={(d) => d.x}
                y={(d) => d.y}
                fill="var(--primary)"
                height={0.4}
                x={(d) => d.x}
                y={(d) => d.y}
              />
              <RuleY
                x={item.target}
                stroke="var(--chart-primary)"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            </CartesianView>
          </Chart>
          <div className="flex gap-2 text-xs text-muted-foreground mt-1">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: "var(--destructive)", opacity: 0.3 }} />
              <span>Poor</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: "var(--warning)", opacity: 0.3 }} />
              <span>Fair</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: "var(--success)", opacity: 0.3 }} />
              <span>Good</span>
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="w-3 h-1 rounded" style={{ backgroundColor: "var(--primary)" }} />
              <span>Target</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}