import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ColorPicker } from "@/components/ui/color-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import type {
  ChartMetric,
  ChartPresentationSettings,
} from "@/features/charts/render/chart-renderer"

export interface ChartSettingsEditorProps {
  value: ChartPresentationSettings
  metrics: readonly ChartMetric[]
  onChange: (next: ChartPresentationSettings) => void
  onReset?: () => void
  title?: string
  description?: string
}

const chartKinds = ["bar", "line", "area", "pie"] as const
const chartPalettes = ["default", "warm", "cool", "rainbow"] as const
const barDirections = ["vertical", "horizontal"] as const
const labelDisplays = ["none", "value", "percent", "both"] as const
const legendPlacements = ["top", "bottom", "left", "right", "hidden"] as const
const gridModes = ["none", "horizontal", "vertical", "both"] as const
const pieLabelPositions = ["none", "inside", "outside", "center"] as const
const chartSizes = ["small", "medium", "large", "custom"] as const
const areaFills = ["gradient", "solid", "none"] as const

function selectedOption<Option extends string>(
  options: readonly Option[],
  selected: string,
  fallback: Option,
): Option {
  return options.find((option) => option === selected) ?? fallback
}

function FormField({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

export function ChartSettingsEditor({
  value,
  metrics,
  onChange,
  onReset,
  title = "Chart settings",
  description = "Choose what the chart shows and how it is presented.",
}: ChartSettingsEditorProps) {
  const update = <Key extends keyof ChartPresentationSettings>(
    key: Key,
    next: ChartPresentationSettings[Key],
  ) => onChange({ ...value, [key]: next })

  const toggleMetric = (key: string) => {
    const metricKeys = value.metricKeys.includes(key)
      ? value.metricKeys.filter((current) => current !== key)
      : [...value.metricKeys, key]
    update("metricKeys", metricKeys)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {onReset && (
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            Reset
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2">
          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Metrics</legend>
            <p className="text-xs text-muted-foreground">Select one or more data series.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((metric) => {
                const id = `chart-metric-${metric.key}`
                return (
                  <label
                    className="flex min-h-9 items-center gap-2 text-sm"
                    htmlFor={id}
                    key={metric.key}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={value.metricKeys.includes(metric.key)}
                      onChange={() => toggleMetric(metric.key)}
                    />
                    {metric.label}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="chart-kind" label="Chart type">
              <Select
                id="chart-kind"
                value={value.kind}
                onValueChange={(next) => update("kind", selectedOption(chartKinds, next, "bar"))}
                options={[
                  { value: "bar", label: "Bar" },
                  { value: "line", label: "Line" },
                  { value: "area", label: "Area" },
                  { value: "pie", label: "Pie / donut" },
                ]}
              />
            </FormField>

            <FormField id="chart-palette" label="Color palette">
              <Select
                id="chart-palette"
                value={value.palette}
                onValueChange={(next) =>
                  update("palette", selectedOption(chartPalettes, next, "default"))
                }
                options={[
                  { value: "default", label: "Default" },
                  { value: "warm", label: "Warm" },
                  { value: "cool", label: "Cool" },
                  { value: "rainbow", label: "Rainbow" },
                ]}
              />
            </FormField>

            {value.kind === "bar" && (
              <FormField id="bar-direction" label="Bar direction">
                <Select
                  id="bar-direction"
                  value={value.barDirection}
                  onValueChange={(next) =>
                    update("barDirection", selectedOption(barDirections, next, "vertical"))
                  }
                  options={[
                    { value: "vertical", label: "Vertical bars" },
                    { value: "horizontal", label: "Horizontal bars" },
                  ]}
                />
              </FormField>
            )}

            {value.kind === "area" && (
              <FormField id="area-fill" label="Area fill">
                <Select
                  id="area-fill"
                  value={value.areaFill}
                  onValueChange={(next) =>
                    update("areaFill", selectedOption(areaFills, next, "gradient"))
                  }
                  options={[
                    { value: "gradient", label: "Gradient" },
                    { value: "solid", label: "Solid" },
                    { value: "none", label: "None" },
                  ]}
                />
              </FormField>
            )}

            <FormField id="chart-labels" label="Data labels">
              <Select
                id="chart-labels"
                value={value.labelDisplay}
                onValueChange={(next) =>
                  update("labelDisplay", selectedOption(labelDisplays, next, "none"))
                }
                options={[
                  { value: "none", label: "Hidden" },
                  { value: "value", label: "Values" },
                  { value: "percent", label: "Percentages" },
                  { value: "both", label: "Values and percentages" },
                ]}
              />
            </FormField>

            <FormField id="chart-label-color" label="Label color">
              <ColorPicker
                id="chart-label-color"
                value={value.labelColor}
                onChange={(next) => update("labelColor", next)}
              />
            </FormField>

            <FormField id="chart-grid" label="Grid lines">
              <Select
                id="chart-grid"
                value={value.grid}
                onValueChange={(next) =>
                  update("grid", selectedOption(gridModes, next, "horizontal"))
                }
                options={[
                  { value: "none", label: "None" },
                  { value: "horizontal", label: "Horizontal" },
                  { value: "vertical", label: "Vertical" },
                  { value: "both", label: "Horizontal and vertical" },
                ]}
              />
            </FormField>

            {value.kind === "pie" && (
              <FormField id="pie-label-position" label="Pie label position">
                <Select
                  id="pie-label-position"
                  value={value.pieLabelPosition}
                  onValueChange={(next) =>
                    update("pieLabelPosition", selectedOption(pieLabelPositions, next, "outside"))
                  }
                  options={[
                    { value: "none", label: "Hidden" },
                    { value: "inside", label: "Inside" },
                    { value: "outside", label: "Outside" },
                    { value: "center", label: "Center" },
                  ]}
                />
              </FormField>
            )}

            <FormField id="chart-legend" label="Legend">
              <Select
                id="chart-legend"
                value={value.legend}
                onValueChange={(next) =>
                  update("legend", selectedOption(legendPlacements, next, "bottom"))
                }
                options={[
                  { value: "top", label: "Top" },
                  { value: "bottom", label: "Bottom" },
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                  { value: "hidden", label: "Hidden" },
                ]}
              />
            </FormField>

            <FormField id="chart-size" label="Chart size">
              <Select
                id="chart-size"
                value={value.size}
                onValueChange={(next) => update("size", selectedOption(chartSizes, next, "medium"))}
                options={[
                  { value: "small", label: "Small (200 px)" },
                  { value: "medium", label: "Medium (300 px)" },
                  { value: "large", label: "Large (400 px)" },
                  { value: "custom", label: "Custom" },
                ]}
              />
            </FormField>

            {value.size === "custom" && (
              <FormField id="chart-height" label="Height (100–800 px)">
                <Input
                  id="chart-height"
                  type="number"
                  min={100}
                  max={800}
                  step={10}
                  value={value.height}
                  onChange={(event) => update("height", Number(event.target.value))}
                />
              </FormField>
            )}

            <FormField id="chart-animation" label="Animation duration (ms)">
              <Input
                id="chart-animation"
                type="number"
                min={0}
                max={5000}
                step={100}
                value={value.animationDuration}
                onChange={(event) => update("animationDuration", Number(event.target.value))}
              />
            </FormField>

            <FormField id="chart-width-mode" label="Width">
              <Select
                id="chart-width-mode"
                value={value.width.mode}
                onValueChange={(next) =>
                  update(
                    "width",
                    next === "auto" ? { mode: "auto" } : { mode: "custom", value: 720 },
                  )
                }
                options={[
                  { value: "auto", label: "Fit container" },
                  { value: "custom", label: "Custom width" },
                ]}
              />
            </FormField>

            {value.width.mode === "custom" && (
              <FormField id="chart-custom-width" label="Custom width (280–1600 px)">
                <Input
                  id="chart-custom-width"
                  type="number"
                  min={280}
                  max={1600}
                  step={10}
                  value={value.width.value}
                  onChange={(event) =>
                    update("width", { mode: "custom", value: Number(event.target.value) })
                  }
                />
              </FormField>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
