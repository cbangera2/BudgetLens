import {
  AREA_FILLS,
  CHART_METRICS,
  CHART_SIZES,
  CHART_TYPES,
  COLOR_SCHEMES,
  DASHBOARD_CONFIGURATION_VERSION,
  DASHBOARD_MODULES,
  GRID_TYPES,
  LABEL_POSITIONS,
  LEGEND_POSITIONS,
  VALUE_DISPLAYS,
  type ChartAppearance,
  type ChartConfiguration,
  type ChartConfigurationInput,
  type ChartFilters,
  type ChartMetric,
  type DashboardConfiguration,
  type DashboardModule,
} from "./model"

export const DEFAULT_PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"]

export const DEFAULT_CHART_FILTERS: ChartFilters = {
  categories: [],
  descriptions: [],
  transactionTypes: [],
  date: {},
}

export const DEFAULT_CHART_APPEARANCE: ChartAppearance = {
  showGrid: true,
  showLegend: true,
  palette: DEFAULT_PALETTE,
  labelColor: "#475569",
  gridType: "both",
  legendPosition: "bottom",
  labelPosition: "outside",
  colorScheme: "default",
  areaFill: "gradient",
  animationDuration: 400,
  size: "medium",
  height: 360,
  width: 640,
  widthAuto: true,
}

export const DEFAULT_DASHBOARD_CONFIGURATION: DashboardConfiguration = {
  version: DASHBOARD_CONFIGURATION_VERSION,
  moduleOrder: [...DASHBOARD_MODULES],
  hiddenModules: [],
  customCharts: [],
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const COLOR = /^(#[\da-f]{3,8}|(?:rgb|hsl)a?\([^)]*\)|var\(--[\w-]+\))$/i

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined
}

function member<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  return typeof value === "string" ? values.find((candidate) => candidate === value) : undefined
}

function text(value: unknown, fallback: string, maximum = 120): string {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().slice(0, maximum)
  return normalized || fallback
}

function stringList(value: unknown, maximum = 100): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, maximum)
}

function numberWithin(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && COLOR.test(value.trim()) ? value.trim() : fallback
}

function date(value: unknown): string | undefined {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value
}

function normalizeFilters(value: unknown): ChartFilters {
  const source = record(value)
  const dateSource = record(source?.date)
  const start = date(dateSource?.start)
  const end = date(dateSource?.end)
  const normalizedDate =
    start && end && start > end
      ? { start: end, end: start }
      : { ...(start ? { start } : {}), ...(end ? { end } : {}) }

  return {
    categories: stringList(source?.categories),
    descriptions: stringList(source?.descriptions),
    transactionTypes: stringList(source?.transactionTypes),
    date: normalizedDate,
  }
}

function normalizeAppearance(value: unknown): ChartAppearance {
  const source = record(value)
  const palette = Array.isArray(source?.palette)
    ? source.palette
        .filter((entry): entry is string => typeof entry === "string" && COLOR.test(entry.trim()))
        .map((entry) => entry.trim())
        .slice(0, 12)
    : []

  return {
    showGrid:
      typeof source?.showGrid === "boolean" ? source.showGrid : DEFAULT_CHART_APPEARANCE.showGrid,
    showLegend:
      typeof source?.showLegend === "boolean"
        ? source.showLegend
        : DEFAULT_CHART_APPEARANCE.showLegend,
    palette: palette.length ? palette : [...DEFAULT_PALETTE],
    labelColor: color(source?.labelColor, DEFAULT_CHART_APPEARANCE.labelColor),
    gridType:
      member(source?.gridType, GRID_TYPES) ??
      (source?.showGrid === false ? "none" : DEFAULT_CHART_APPEARANCE.gridType),
    legendPosition:
      member(source?.legendPosition, LEGEND_POSITIONS) ??
      (source?.showLegend === false ? "none" : DEFAULT_CHART_APPEARANCE.legendPosition),
    labelPosition:
      member(source?.labelPosition, LABEL_POSITIONS) ?? DEFAULT_CHART_APPEARANCE.labelPosition,
    colorScheme: member(source?.colorScheme, COLOR_SCHEMES) ?? DEFAULT_CHART_APPEARANCE.colorScheme,
    areaFill: member(source?.areaFill, AREA_FILLS) ?? DEFAULT_CHART_APPEARANCE.areaFill,
    animationDuration: numberWithin(
      source?.animationDuration,
      DEFAULT_CHART_APPEARANCE.animationDuration,
      0,
      2_000,
    ),
    size: member(source?.size, CHART_SIZES) ?? DEFAULT_CHART_APPEARANCE.size,
    height: numberWithin(source?.height, DEFAULT_CHART_APPEARANCE.height, 160, 2_000),
    width: numberWithin(source?.width, DEFAULT_CHART_APPEARANCE.width, 240, 3_000),
    widthAuto:
      typeof source?.widthAuto === "boolean"
        ? source.widthAuto
        : DEFAULT_CHART_APPEARANCE.widthAuto,
  }
}

export function createDefaultChart(id: string): ChartConfiguration {
  return {
    id: text(id, "chart", 80),
    title: "Custom chart",
    type: "bar-vertical",
    metrics: ["expenses"],
    valueDisplay: "value",
    filters: normalizeFilters(DEFAULT_CHART_FILTERS),
    appearance: normalizeAppearance(DEFAULT_CHART_APPEARANCE),
  }
}

export function normalizeChartConfiguration(
  value: unknown,
  fallbackId = "chart",
): ChartConfiguration {
  const source = record(value)
  const id = text(source?.id, fallbackId, 80)
  const metrics = Array.isArray(source?.metrics)
    ? [
        ...new Set(
          source.metrics
            .map((metric) => member(metric, CHART_METRICS))
            .filter((metric): metric is ChartMetric => metric !== undefined),
        ),
      ]
    : undefined

  return {
    id,
    title: text(source?.title, "Custom chart"),
    type: member(source?.type, CHART_TYPES) ?? "bar-vertical",
    // An explicit empty list is meaningful: it lets people temporarily hide every
    // series while configuring a chart. Missing or malformed legacy data still
    // receives a useful default.
    metrics: metrics ?? ["expenses"],
    valueDisplay: member(source?.valueDisplay, VALUE_DISPLAYS) ?? "value",
    filters: normalizeFilters(source?.filters),
    appearance: normalizeAppearance(source?.appearance),
  }
}

function moduleList(value: unknown): DashboardModule[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .map((module) => member(module, DASHBOARD_MODULES))
        .filter((module): module is DashboardModule => module !== undefined),
    ),
  ]
}

export function normalizeDashboardConfiguration(value: unknown): DashboardConfiguration {
  const source = record(value)
  const specifiedOrder = moduleList(source?.moduleOrder)
  const moduleOrder = [
    ...specifiedOrder,
    ...DASHBOARD_MODULES.filter((module) => !specifiedOrder.includes(module)),
  ]
  const seenIds = new Set<string>()
  const customCharts: ChartConfiguration[] = []

  if (Array.isArray(source?.customCharts)) {
    for (const [index, chart] of source.customCharts.slice(0, 100).entries()) {
      const normalized = normalizeChartConfiguration(chart, `chart-${index + 1}`)
      if (seenIds.has(normalized.id)) continue
      seenIds.add(normalized.id)
      customCharts.push(normalized)
    }
  }

  return {
    version: DASHBOARD_CONFIGURATION_VERSION,
    moduleOrder,
    hiddenModules: moduleList(source?.hiddenModules),
    customCharts,
  }
}

/** Safely parses content read from localStorage. Invalid or future data resets to defaults. */
export function deserializeDashboardConfiguration(
  serialized: string | null,
): DashboardConfiguration {
  if (!serialized) return normalizeDashboardConfiguration(undefined)
  try {
    const parsed: unknown = JSON.parse(serialized)
    const source = record(parsed)
    if (typeof source?.version === "number" && source.version > DASHBOARD_CONFIGURATION_VERSION) {
      return normalizeDashboardConfiguration(undefined)
    }
    return normalizeDashboardConfiguration(parsed)
  } catch {
    return normalizeDashboardConfiguration(undefined)
  }
}

export function createChart(
  configuration: DashboardConfiguration,
  input: ChartConfigurationInput,
): DashboardConfiguration {
  const chart = normalizeChartConfiguration(input, input.id)
  if (configuration.customCharts.some((existing) => existing.id === chart.id)) return configuration
  return { ...configuration, customCharts: [...configuration.customCharts, chart] }
}

export function updateChart(
  configuration: DashboardConfiguration,
  id: string,
  changes: Partial<ChartConfiguration>,
): DashboardConfiguration {
  if (!configuration.customCharts.some((chart) => chart.id === id)) return configuration
  return {
    ...configuration,
    customCharts: configuration.customCharts.map((chart) =>
      chart.id === id ? normalizeChartConfiguration({ ...chart, ...changes, id }, id) : chart,
    ),
  }
}

export function removeChart(
  configuration: DashboardConfiguration,
  id: string,
): DashboardConfiguration {
  const customCharts = configuration.customCharts.filter((chart) => chart.id !== id)
  return customCharts.length === configuration.customCharts.length
    ? configuration
    : { ...configuration, customCharts }
}

export function reorderChart(
  configuration: DashboardConfiguration,
  id: string,
  destinationIndex: number,
): DashboardConfiguration {
  const sourceIndex = configuration.customCharts.findIndex((chart) => chart.id === id)
  if (sourceIndex < 0) return configuration
  const customCharts = [...configuration.customCharts]
  const [chart] = customCharts.splice(sourceIndex, 1)
  customCharts.splice(Math.min(Math.max(0, destinationIndex), customCharts.length), 0, chart!)
  return { ...configuration, customCharts }
}

export function reorderDashboardModule(
  configuration: DashboardConfiguration,
  module: DashboardModule,
  destinationIndex: number,
): DashboardConfiguration {
  const moduleOrder = configuration.moduleOrder.filter((candidate) => candidate !== module)
  moduleOrder.splice(Math.min(Math.max(0, destinationIndex), moduleOrder.length), 0, module)
  return { ...configuration, moduleOrder }
}

export function setDashboardModuleHidden(
  configuration: DashboardConfiguration,
  module: DashboardModule,
  hidden: boolean,
): DashboardConfiguration {
  const hiddenModules = configuration.hiddenModules.filter((candidate) => candidate !== module)
  if (hidden) hiddenModules.push(module)
  return { ...configuration, hiddenModules }
}
