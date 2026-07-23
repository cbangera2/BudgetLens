import * as React from "react"
import {
  Legend as RechartsLegend,
  Tooltip as RechartsTooltip,
  type LegendPayload,
  type TooltipContentProps,
} from "recharts"

import { cn } from "@/lib/cn"

const themes = { light: "", dark: ".dark" } as const
const themeNames: ReadonlyArray<keyof typeof themes> = ["light", "dark"]
const defaultValueFormatter = (value: number) => String(value)

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof themes, string> }
  )
>

const ChartContext = React.createContext<ChartConfig | null>(null)

function useChart() {
  const config = React.useContext(ChartContext)
  if (!config) throw new Error("Chart components must be rendered inside ChartContainer")
  return config
}

export function ChartContainer({
  id,
  className,
  config,
  children,
  ...props
}: React.ComponentProps<"div"> & { config: ChartConfig }) {
  const generatedId = React.useId()
  const chartId = `chart-${id ?? generatedId.replaceAll(":", "")}`

  return (
    <ChartContext.Provider value={config}>
      <div
        data-chart={chartId}
        className={cn(
          "min-h-64 w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/60 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-layer]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {children}
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colors = Object.entries(config).filter(([, item]) => item.color || item.theme)
  if (colors.length === 0) return null

  const css = themeNames
    .map((theme) => {
      const selector = themes[theme]
      const variables = colors
        .map(([key, item]) => {
          const color = item.theme?.[theme] ?? item.color
          return color ? `  --color-${key}: ${color};` : ""
        })
        .filter(Boolean)
        .join("\n")
      return `${selector} [data-chart="${id}"] {\n${variables}\n}`
    })
    .join("\n")

  return <style>{css}</style>
}

export const ChartTooltip = RechartsTooltip

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  valueFormatter = defaultValueFormatter,
}: Partial<TooltipContentProps<number, string>> & {
  className?: string
  valueFormatter?: (value: number, name: string) => React.ReactNode
}) {
  const config = useChart()
  if (!active || !payload?.length) return null

  return (
    <div
      className={cn(
        "grid min-w-40 gap-2 rounded-xl border bg-card p-3 text-xs shadow-xl",
        className,
      )}
    >
      {label !== undefined && <p className="font-medium">{String(label)}</p>}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "value")
          const name = typeof item.name === "string" ? item.name : key
          const displayName = config[key]?.label ?? name
          const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0)
          return (
            <div key={key} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: item.color ?? `var(--color-${key})` }}
                  aria-hidden="true"
                />
                {displayName}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {valueFormatter(value, name)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ChartLegend = RechartsLegend

export function ChartLegendContent({
  payload,
  className,
}: {
  payload?: ReadonlyArray<LegendPayload>
  className?: string
}) {
  const config = useChart()
  if (!payload?.length) return null

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-4 pt-3", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value)
        return (
          <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-2 rounded-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            {config[key]?.label ?? item.value}
          </span>
        )
      })}
    </div>
  )
}
