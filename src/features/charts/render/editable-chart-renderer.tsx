import { Settings2, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  CustomChartRenderer,
  type ChartPresentationSettings,
  type CustomChartRendererProps,
} from "@/features/charts/render/chart-renderer"
import {
  ChartSettingsEditor,
  type ChartSettingsEditorProps,
} from "@/features/charts/render/chart-settings-editor"

const kinds = ["bar", "line", "area", "pie"] as const
const directions = ["vertical", "horizontal"] as const
const palettes = ["default", "warm", "cool", "rainbow"] as const
const labels = ["none", "value", "percent", "both"] as const
const legends = ["top", "bottom", "left", "right", "hidden"] as const
const grids = ["none", "horizontal", "vertical", "both"] as const
const pieLabels = ["none", "inside", "outside", "center"] as const
const areaFills = ["gradient", "solid", "none"] as const
const sizes = ["small", "medium", "large", "custom"] as const

type EditableChartRendererProps = Omit<CustomChartRendererProps, "settings" | "actions"> & {
  storageKey: string
  initialSettings: ChartPresentationSettings
  settingsDescription?: ChartSettingsEditorProps["description"]
}

function member<Option extends string>(
  value: unknown,
  options: readonly Option[],
  fallback: Option,
): Option {
  return typeof value === "string"
    ? (options.find((option) => option === value) ?? fallback)
    : fallback
}

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback
}

function normalizeSettings(
  value: unknown,
  fallback: ChartPresentationSettings,
  metricKeys: ReadonlySet<string>,
): ChartPresentationSettings {
  const source = typeof value === "object" && value !== null ? value : {}
  const candidate = source as Partial<ChartPresentationSettings>
  const selectedMetrics = Array.isArray(candidate.metricKeys)
    ? [
        ...new Set(
          candidate.metricKeys.filter(
            (key): key is string => typeof key === "string" && metricKeys.has(key),
          ),
        ),
      ]
    : fallback.metricKeys
  const widthSource = candidate.width
  const width =
    typeof widthSource === "object" &&
    widthSource !== null &&
    widthSource.mode === "custom" &&
    "value" in widthSource
      ? { mode: "custom" as const, value: bounded(widthSource.value, 720, 280, 1_600) }
      : { mode: "auto" as const }

  return {
    kind: member(candidate.kind, kinds, fallback.kind),
    barDirection: member(candidate.barDirection, directions, fallback.barDirection),
    metricKeys: selectedMetrics,
    palette: member(candidate.palette, palettes, fallback.palette),
    labelDisplay: member(candidate.labelDisplay, labels, fallback.labelDisplay),
    labelColor:
      typeof candidate.labelColor === "string" ? candidate.labelColor : fallback.labelColor,
    legend: member(candidate.legend, legends, fallback.legend),
    grid: member(candidate.grid, grids, fallback.grid),
    pieLabelPosition: member(candidate.pieLabelPosition, pieLabels, fallback.pieLabelPosition),
    areaFill: member(candidate.areaFill, areaFills, fallback.areaFill),
    animationDuration: bounded(candidate.animationDuration, fallback.animationDuration, 0, 5_000),
    size: member(candidate.size, sizes, fallback.size),
    height: bounded(candidate.height, fallback.height, 100, 800),
    width,
  }
}

function loadSettings(
  storageKey: string,
  fallback: ChartPresentationSettings,
  metricKeys: ReadonlySet<string>,
): ChartPresentationSettings {
  try {
    const serialized = localStorage.getItem(storageKey)
    return serialized ? normalizeSettings(JSON.parse(serialized), fallback, metricKeys) : fallback
  } catch {
    return fallback
  }
}

export function EditableChartRenderer({
  storageKey,
  initialSettings,
  settingsDescription,
  metrics,
  title,
  ...rendererProps
}: EditableChartRendererProps) {
  const metricKeys = new Set(metrics.map((metric) => metric.key))
  const [settings, setSettings] = useState(() =>
    loadSettings(storageKey, initialSettings, metricKeys),
  )
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings))
  }, [settings, storageKey])

  useEffect(() => {
    if (!editing) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false)
    }
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [editing])

  return (
    <>
      <CustomChartRenderer
        {...rendererProps}
        title={title}
        metrics={metrics}
        settings={settings}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${title}`}
            onClick={() => setEditing(true)}
          >
            <Settings2 className="size-4" />
            <span className="hidden sm:inline">Edit chart</span>
          </Button>
        }
      />

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(false)
          }}
        >
          <dialog
            open
            aria-modal="true"
            aria-labelledby={`${storageKey}-editor-title`}
            className="relative m-0 max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background/95 px-6 py-5 backdrop-blur">
              <div>
                <h2 id={`${storageKey}-editor-title`} className="text-xl font-semibold">
                  Edit {title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Changes are saved automatically in this browser.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close chart editor"
                onClick={() => setEditing(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-4 p-4 sm:p-6">
              <ChartSettingsEditor
                value={settings}
                metrics={metrics}
                {...(settingsDescription ? { description: settingsDescription } : {})}
                onChange={setSettings}
                onReset={() => setSettings(initialSettings)}
              />
              <div className="flex justify-end">
                <Button type="button" onClick={() => setEditing(false)}>
                  Done
                </Button>
              </div>
            </div>
          </dialog>
        </div>
      )}
    </>
  )
}
