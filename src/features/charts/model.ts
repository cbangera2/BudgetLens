export const DASHBOARD_CONFIGURATION_VERSION = 1 as const

export const CHART_TYPES = ["bar-vertical", "bar-horizontal", "line", "area", "pie"] as const
export type ChartType = (typeof CHART_TYPES)[number]

export const CHART_METRICS = ["income", "expenses", "savings", "netWorth", "investments"] as const
export type ChartMetric = (typeof CHART_METRICS)[number]

export const VALUE_DISPLAYS = ["none", "value", "percentage", "both"] as const
export type ValueDisplay = (typeof VALUE_DISPLAYS)[number]

export const CHART_SIZES = ["small", "medium", "large", "custom"] as const
export type ChartSize = (typeof CHART_SIZES)[number]

export const GRID_TYPES = ["none", "horizontal", "vertical", "both"] as const
export type GridType = (typeof GRID_TYPES)[number]

export const LEGEND_POSITIONS = ["none", "right", "bottom", "left", "top"] as const
export type LegendPosition = (typeof LEGEND_POSITIONS)[number]

export const LABEL_POSITIONS = ["none", "inside", "outside", "center"] as const
export type LabelPosition = (typeof LABEL_POSITIONS)[number]

export const COLOR_SCHEMES = ["default", "warm", "cool", "rainbow"] as const
export type ColorScheme = (typeof COLOR_SCHEMES)[number]

export const AREA_FILLS = ["gradient", "solid", "none"] as const
export type AreaFill = (typeof AREA_FILLS)[number]

export const DASHBOARD_MODULES = [
  "summary",
  "cashFlow",
  "categorySpending",
  "budgets",
  "recentTransactions",
  "wealth",
] as const
export type DashboardModule = (typeof DASHBOARD_MODULES)[number]

export interface ChartDateFilter {
  start?: string
  end?: string
}

export interface ChartFilters {
  categories: string[]
  descriptions: string[]
  transactionTypes: string[]
  date: ChartDateFilter
}

export interface ChartAppearance {
  /** Kept for compatibility with early rewrite preferences. */
  showGrid: boolean
  /** Kept for compatibility with early rewrite preferences. */
  showLegend: boolean
  palette: string[]
  labelColor: string
  gridType: GridType
  legendPosition: LegendPosition
  labelPosition: LabelPosition
  colorScheme: ColorScheme
  areaFill: AreaFill
  animationDuration: number
  size: ChartSize
  /** Used only when size is custom. */
  height: number
  /** Used only when size is custom. */
  width: number
  widthAuto: boolean
}

export interface ChartConfiguration {
  id: string
  title: string
  type: ChartType
  metrics: ChartMetric[]
  valueDisplay: ValueDisplay
  filters: ChartFilters
  appearance: ChartAppearance
}

export interface DashboardConfigurationV1 {
  version: typeof DASHBOARD_CONFIGURATION_VERSION
  moduleOrder: DashboardModule[]
  hiddenModules: DashboardModule[]
  customCharts: ChartConfiguration[]
}

export type DashboardConfiguration = DashboardConfigurationV1

export type ChartConfigurationInput = Partial<ChartConfiguration> & Pick<ChartConfiguration, "id">
