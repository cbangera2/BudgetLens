import { useMemo } from "react"
import { cn } from "@/lib/cn"

interface RadarChartProps {
  data: readonly {
    category: string
    value: number
    maxValue?: number
  }[]
  height?: number
  showTooltip?: boolean
  color?: string
}

export function RadarChart({
  data,
  height = 300,
  showTooltip = true,
  color = "var(--chart-primary)",
}: RadarChartProps) {
  if (!data.length) return <div style={{ height }}>No data</div>

  const maxValue = Math.max(...data.map((d) => d.maxValue ?? d.value), 1)
  const maxRadius = Math.min(height, 300) / 2 - 30

  const anglePoints = useMemo(() => {
    return data.map((d, i) => {
      const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2
      const radius = Math.max(0, (d.value / Math.max(1, Math.max(...data.map((d) => d.value))))) * Math.min(height, 300) / 2 - 30
      return {
        category: d.category,
        value: d.value,
        maxValue: d.maxValue || 1,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        angle,
        radius,
        labelX: Math.cos(angle) * (maxRadius + 30),
        labelY: Math.sin(angle) * (maxRadius + 30),
      })
    }, [data])

  const maxValue = Math.max(...data.map((d) => d.maxValue ?? d.value), 1)
  const gridValues = [0.25, 0.5, 0.75, 1].map((v) => maxValue * v)

  const anglePoints = useMemo(() => {
    return data.map((d, i) => {
      const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2
      const radius = Math.max(0, (d.value / Math.max(1, Math.max(...data.map((d) => d.value))))) * Math.min(height, 300) / 2 - 30
      return {
        category: d.category,
        value: d.value,
        maxValue: d.maxValue || 1,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        angle,
        radius,
        labelX: Math.cos(angle) * (maxRadius + 30),
        labelY: Math.sin(angle) * (maxRadius + 30),
      })
    }, [data])

  const maxValue = Math.max(...data.map((d) => d.maxValue ?? d.value), 1)
  const gridValues = [0.25, 0.5, 0.75, 1].map((v) => maxValue * v)

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <svg width="100%" height={height} viewBox={`0 0 ${height} ${height}`}>
        <defs>
          <linearGradient id="radar-area-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <g transform={`translate(${height / 2}, ${height / 2)}`}>
          <defs>
            <linearGradient id="radar-area-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <polygon
            points={anglePoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="url(#radar-area-gradient)"
            stroke="var(--chart-primary)"
            strokeWidth={2}
          />

          {([0.25, 0.5, 0.75, 1].map((v) => maxValue * v)).map((v, i) => (
            <polygon
              key={i}
              points={anglePoints.map((p) => {
                const radius = (v / maxValue) * Math.min(height, 300) / 2 - 30
                return `${radius * Math.cos(p.angle)},${radius * Math.sin(p.angle)}`
              }).join(" ")}
              fill="none"
              stroke="var(--muted)"
              strokeDasharray="4 4"
              strokeWidth={0.5}
            />
          ))}

          {anglePoints.map((p) => (
            <g key={p.category}>
              <line
                x1="0"
                y1="0"
                x2={p.x}
                y2={p.y}
                stroke="var(--muted)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={Math.cos(p.angle) * (maxRadius + 20)}
                y={Math.sin(p.angle) * (maxRadius + 20)}
                textAnchor={Math.cos(p.angle) > 0 ? "start" : "end"}
                dominantBaseline={Math.sin(p.angle) > 0 ? "hanging" : "baseline"}
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                {p.category}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}