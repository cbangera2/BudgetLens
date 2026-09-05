import * as React from "react"

import { cn } from "@/lib/cn"

const themes = { light: "", dark: ".dark" } as const
const themeNames: ReadonlyArray<keyof typeof themes> = ["light", "dark"]

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

export function useChartConfig(): ChartConfig | null {
  return React.useContext(ChartContext)
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
          "min-h-64 w-full text-xs [&_.ts-chart-host]:outline-none [&_svg]:outline-none",
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

export interface ChartTooltipItem {
  key: string
  name: string
  value: number
  color?: string
}

const defaultTooltipValueFormatter = (value: number) => String(value)

export function ChartTooltipContent({
  label,
  payload,
  className,
  valueFormatter = defaultTooltipValueFormatter,
}: {
  label?: string
  payload?: readonly ChartTooltipItem[]
  className?: string
  valueFormatter?: (value: number, name: string) => React.ReactNode
}) {
  const config = useChartConfig()
  if (!payload?.length) return null

  return (
    <div
      className={cn(
        "grid min-w-40 gap-2 rounded-xl border bg-card p-3 text-xs shadow-xl",
        className,
      )}
    >
      {label !== undefined && <p className="font-medium">{label}</p>}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const displayName = config?.[item.key]?.label ?? item.name
          return (
            <div key={item.key} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: item.color ?? `var(--color-${item.key})` }}
                  aria-hidden="true"
                />
                {displayName}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {valueFormatter(item.value, item.name)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface ChartLegendItem {
  key: string
  label: React.ReactNode
  color?: string
}

export function ChartLegendContent({
  payload,
  className,
}: {
  payload?: ReadonlyArray<ChartLegendItem>
  className?: string
}) {
  const config = useChartConfig()
  if (!payload?.length) return null

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-4 pt-3", className)}>
      {payload.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2 rounded-sm"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {config?.[item.key]?.label ?? item.label}
        </span>
      ))}
    </div>
  )
}
