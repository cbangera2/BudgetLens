import { useMemo } from "react"
import { formatMoney } from "@/features/dashboard/format"
import { cn } from "@/lib/cn"

interface CalendarHeatmapChartProps {
  data: readonly {
    date: string
    value: number
  }[]
  height?: number
  year?: number
  colorScale?: "blues" | "greens" | "reds" | "oranges"
}

const colorScales = {
  blues: ["#eff6ff", "#bfdbfe", "#3b82f6", "#2563eb", "#1e40af"],
  greens: ["#f0fdf4", "#bbf7d0", "#22c55e", "#16a34a", "#166534"],
  reds: ["#fef2f2", "#fecaca", "#ef4444", "#dc2626", "#991b1b"],
  oranges: ["#fff7ed", "#fed7aa", "#fb923c", "#f97316", "#9a3412"],
}

export function CalendarHeatmapChart({
  data,
  height = 200,
  year = new Date().getFullYear(),
  colorScale = "blues",
}: CalendarHeatmapChartProps) {
  const dataMap = useMemo(() => {
    const map = new Map<string, number>()
    data.forEach((d) => {
      if (d.value !== undefined && d.value !== null) {
        map.set(d.date, d.value)
      }
    }
    return map
  }, [data]);

  const maxValue = Math.max(...Array.from(data.map((d) => d.value || 0)), 1)
  const colors = colorScales[colorScale] || colorScales.blues

  const getColor = (value: number | undefined) => {
    if (!value || value === 0) return colors[0]
    const intensity = Math.min(value / Math.max(...data.map((d) => d.value || 0), 1), 1)
    const idx = Math.floor(intensity * (colors.length - 1))
    return colors[idx]
  }

  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)

  const weeks = []
  let current = new Date(startDate)
  current.setDate(current.getDate() - current.getDay())
  while (current <= endDate) {
    const week = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(current)
      date.setDate(current.getDate() + i)
      week.push(new Date(date))
    }
    weeks.push(week)
    current.setDate(current.getDate() + 7)
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]

  return (
    <div className="font-mono text-xs" style={{ lineHeight: 1.2 }}>
      <div className="flex gap-1">
        {monthNames.map((month, i) => (
          <div key={month} className="w-24 text-center text-xs text-muted-foreground">
            {month}
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              const isCurrentMonth = day.getMonth() === new Date().getMonth() && day.getFullYear() === new Date().getFullYear()
              const isFuture = day > new Date()
              const dateStr = day.toISOString().split("T")[0]
              const value = dataMap.get(dateStr) || 0
              const color = getColor(value)
              const isInYear = day.getFullYear() === year
              const dayNum = day.getDate()

              return (
                <div
                  key={dateStr}
                  className={cn(
                    "w-6 h-6 rounded flex items-center justify-center text-[9px] transition-colors",
                    !isInYear && "opacity-20",
                    isFuture && "opacity-30",
                    isCurrentMonth && "ring-2 ring-primary",
                    value > 0 && "font-medium",
                  )}
                  style={{ backgroundColor: color }}
                  title={`${day.toLocaleDateString()}: ${value > 0 ? "$" + value : "No spending"}`}
                >
                  {di === 0 && wi === 0 ? dayNum : ""}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded" style={{ backgroundColor: colors[0] }} />
          <span>$0</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded" style={{ backgroundColor: colors[2] }} />
          <span>${Math.round(Math.max(...Array.from(new Map().values())) / 2)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded" style={{ backgroundColor: colors[4] }} />
          <span>${Math.round(Math.max(...Array.from(new Map().values())))}</span>
        </div>
      </div>
    </div>
  )
}