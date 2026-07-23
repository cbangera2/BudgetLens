import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, GripVertical, Plus, Settings2, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Transaction, WealthSnapshot } from "@/domain/models"
import {
  CHART_METRICS,
  createChart,
  createDefaultChart,
  deserializeDashboardConfiguration,
  removeChart,
  reorderChart,
  updateChart,
  type ChartConfiguration,
  type ChartMetric as StoredChartMetric,
  type DashboardConfiguration,
} from "@/features/charts"
import {
  ChartSettingsEditor,
  CustomChartRenderer,
  type ChartDataRow,
  type ChartMetric,
  type ChartPresentationSettings,
} from "@/features/charts/render"
import { buildCategoryChartData, buildMonthlyChartData } from "@/features/charts/transforms"

const storageKey = "budgetlens.custom-charts.v1"
const selectClass =
  "min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const metrics: readonly ChartMetric[] = [
  {
    key: "income",
    label: "Income",
    color: "var(--chart-income)",
    formatValue: formatCurrency,
  },
  {
    key: "expenses",
    label: "Expenses",
    color: "var(--chart-expense)",
    formatValue: formatCurrency,
  },
  {
    key: "savings",
    label: "Savings",
    color: "var(--chart-savings)",
    formatValue: formatCurrency,
  },
  {
    key: "netWorth",
    label: "Net worth",
    color: "var(--chart-net-worth)",
    formatValue: formatCurrency,
  },
  {
    key: "investments",
    label: "Investments",
    color: "var(--chart-investment)",
    formatValue: formatCurrency,
  },
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

function defaultWorkspace(): DashboardConfiguration {
  const configuration = deserializeDashboardConfiguration(null)
  const chart = createDefaultChart("monthly-overview")
  chart.title = "Monthly overview"
  chart.type = "area"
  chart.metrics = ["income", "expenses", "savings"]
  chart.valueDisplay = "none"
  return createChart(configuration, chart)
}

function loadWorkspace(): DashboardConfiguration {
  const serialized = localStorage.getItem(storageKey)
  return serialized === null ? defaultWorkspace() : deserializeDashboardConfiguration(serialized)
}

function presentationFor(chart: ChartConfiguration): ChartPresentationSettings {
  return {
    kind: chart.type === "bar-horizontal" || chart.type === "bar-vertical" ? "bar" : chart.type,
    barDirection: chart.type === "bar-horizontal" ? "horizontal" : "vertical",
    metricKeys: chart.metrics,
    palette: chart.appearance.colorScheme,
    labelDisplay: chart.valueDisplay === "percentage" ? "percent" : chart.valueDisplay,
    labelColor: chart.appearance.labelColor,
    legend: chart.appearance.legendPosition === "none" ? "hidden" : chart.appearance.legendPosition,
    grid: chart.appearance.gridType,
    pieLabelPosition: chart.appearance.labelPosition,
    areaFill: chart.appearance.areaFill,
    animationDuration: chart.appearance.animationDuration,
    size: chart.appearance.size,
    height: chart.appearance.height,
    width: chart.appearance.widthAuto
      ? { mode: "auto" }
      : { mode: "custom", value: chart.appearance.width },
  }
}

function chartChanges(
  chart: ChartConfiguration,
  presentation: ChartPresentationSettings,
): Partial<ChartConfiguration> {
  const type =
    presentation.kind === "bar"
      ? presentation.barDirection === "horizontal"
        ? "bar-horizontal"
        : "bar-vertical"
      : presentation.kind
  const selected = new Set(presentation.metricKeys)
  const selectedMetrics = CHART_METRICS.filter((metric) => selected.has(metric))
  return {
    type,
    metrics: selectedMetrics,
    valueDisplay:
      presentation.labelDisplay === "percent" ? "percentage" : presentation.labelDisplay,
    appearance: {
      ...chart.appearance,
      showGrid: presentation.grid !== "none",
      showLegend: presentation.legend !== "hidden",
      gridType: presentation.grid,
      legendPosition: presentation.legend === "hidden" ? "none" : presentation.legend,
      labelPosition: presentation.pieLabelPosition,
      colorScheme: presentation.palette,
      areaFill: presentation.areaFill,
      animationDuration: presentation.animationDuration,
      labelColor: presentation.labelColor,
      size: presentation.size,
      height: presentation.height,
      width:
        presentation.width.mode === "custom" ? presentation.width.value : chart.appearance.width,
      widthAuto: presentation.width.mode === "auto",
    },
  }
}

function uniqueValues(
  transactions: readonly Transaction[],
  field: "category" | "description" | "transactionType",
): string[] {
  return [
    ...new Set(
      transactions
        .map((transaction) => transaction[field])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].toSorted()
}

function selectedValues(event: React.ChangeEvent<HTMLSelectElement>): string[] {
  return [...event.currentTarget.selectedOptions].map((option) => option.value)
}

function FilterEditor({
  chart,
  transactions,
  onChange,
}: {
  chart: ChartConfiguration
  transactions: readonly Transaction[]
  onChange: (chart: ChartConfiguration) => void
}) {
  const updateFilters = (changes: Partial<ChartConfiguration["filters"]>) =>
    onChange({ ...chart, filters: { ...chart.filters, ...changes } })
  const updateDate = (key: "start" | "end", value: string) => {
    const date = { ...chart.filters.date }
    if (value) date[key] = value
    else delete date[key]
    updateFilters({ date })
  }
  const fields = [
    ["categories", "Categories", uniqueValues(transactions, "category")],
    ["descriptions", "Merchants / descriptions", uniqueValues(transactions, "description")],
    ["transactionTypes", "Transaction types", uniqueValues(transactions, "transactionType")],
  ] as const

  return (
    <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-3">
      <legend className="px-1 text-sm font-semibold">Chart filters</legend>
      {fields.map(([key, label, options]) => (
        <div className="grid gap-2" key={key}>
          <Label htmlFor={`${chart.id}-${key}`}>{label}</Label>
          <select
            id={`${chart.id}-${key}`}
            multiple
            size={Math.min(4, Math.max(2, options.length))}
            className={selectClass}
            value={chart.filters[key]}
            onChange={(event) => updateFilters({ [key]: selectedValues(event) })}
          >
            {options.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Leave everything unselected for all.</p>
        </div>
      ))}
      <div className="grid gap-2">
        <Label htmlFor={`${chart.id}-start`}>Start date</Label>
        <DatePicker
          id={`${chart.id}-start`}
          value={chart.filters.date.start ?? ""}
          onChange={(next) => updateDate("start", next)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${chart.id}-end`}>End date</Label>
        <DatePicker
          id={`${chart.id}-end`}
          value={chart.filters.date.end ?? ""}
          onChange={(next) => updateDate("end", next)}
        />
      </div>
    </fieldset>
  )
}

function rowsFor(
  chart: ChartConfiguration,
  transactions: readonly Transaction[],
  wealth: readonly WealthSnapshot[],
): ChartDataRow[] {
  if (chart.type === "pie") {
    const metric: StoredChartMetric = chart.metrics[0] ?? "expenses"
    return buildCategoryChartData(transactions, chart.filters, metric).map((point) => ({
      id: point.category,
      label: point.category,
      values: { [metric]: point.value },
    }))
  }
  return buildMonthlyChartData(transactions, wealth, chart.filters).map((point) => ({
    id: point.month,
    label: point.month,
    values: {
      income: point.income,
      expenses: point.expenses,
      savings: point.savings,
      netWorth: point.netWorth,
      investments: point.investments,
    },
  }))
}

function ChartActions({
  chart,
  index,
  count,
  dragAttributes,
  dragListeners,
  onEdit,
  onMove,
  onDelete,
}: {
  chart: ChartConfiguration
  index: number
  count: number
  dragAttributes: DraggableAttributes
  dragListeners: DraggableSyntheticListeners
  onEdit: () => void
  onMove: (destination: number) => void
  onDelete: () => void
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur transition-opacity sm:opacity-60 sm:group-focus-within/chart:opacity-100 sm:group-hover/chart:opacity-100"
      aria-label={`${chart.title} chart actions`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Drag ${chart.title} to reorder`}
        {...dragAttributes}
        {...dragListeners}
      >
        <GripVertical className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={index === 0}
        aria-label={`Move ${chart.title} up`}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={index === count - 1}
        aria-label={`Move ${chart.title} down`}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit ${chart.title}`}
        onClick={onEdit}
      >
        <Settings2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        aria-label={`Delete ${chart.title}`}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function SortableChartCard({
  chart,
  index,
  count,
  children,
  onEdit,
  onMove,
  onDelete,
}: {
  chart: ChartConfiguration
  index: number
  count: number
  children: (actions: ReactNode) => ReactNode
  onEdit: () => void
  onMove: (destination: number) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chart.id,
  })

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/chart relative ${isDragging ? "z-20 opacity-70" : ""}`}
      aria-label={`${chart.title} custom chart`}
    >
      {children(
        <ChartActions
          chart={chart}
          index={index}
          count={count}
          dragAttributes={attributes}
          dragListeners={listeners}
          onEdit={onEdit}
          onMove={onMove}
          onDelete={onDelete}
        />,
      )}
    </section>
  )
}

function ChartEditorDialog({
  chart,
  transactions,
  onChange,
  onClose,
}: {
  chart: ChartConfiguration
  transactions: readonly Transaction[]
  onChange: (changes: Partial<ChartConfiguration>) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby={`${chart.id}-editor-title`}
        className="relative m-0 max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background/95 px-6 py-5 backdrop-blur">
          <div>
            <h2 id={`${chart.id}-editor-title`} className="text-xl font-semibold">
              Edit {chart.title}
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
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid gap-4 p-4 sm:p-6">
          <Card>
            <CardContent className="grid gap-2 pt-6">
              <Label htmlFor={`${chart.id}-title`}>Chart title</Label>
              <Input
                id={`${chart.id}-title`}
                autoFocus
                value={chart.title}
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </CardContent>
          </Card>
          <ChartSettingsEditor
            value={presentationFor(chart)}
            metrics={metrics}
            onChange={(next) => onChange(chartChanges(chart, next))}
          />
          <FilterEditor
            chart={chart}
            transactions={transactions}
            onChange={(next) => onChange({ filters: next.filters })}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  )
}

export function ChartWorkspace({
  transactions,
  wealth,
}: {
  transactions: readonly Transaction[]
  wealth: readonly WealthSnapshot[]
}) {
  const [configuration, setConfiguration] = useState(loadWorkspace)
  const [newTitle, setNewTitle] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(configuration))
  }, [configuration])

  useEffect(() => {
    if (!editingId && !deletingId) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (deletingId) setDeletingId(null)
      else setEditingId(null)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [deletingId, editingId])

  const renderedRows = useMemo(
    () =>
      new Map(
        configuration.customCharts.map((chart) => [chart.id, rowsFor(chart, transactions, wealth)]),
      ),
    [configuration.customCharts, transactions, wealth],
  )

  function addChart() {
    const title = newTitle.trim()
    if (!title) return
    const chart = createDefaultChart(crypto.randomUUID())
    chart.title = title
    chart.type = "area"
    chart.metrics = ["income", "expenses"]
    chart.valueDisplay = "none"
    setConfiguration((current) => createChart(current, chart))
    setNewTitle("")
    setEditingId(chart.id)
  }

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    const destination = configuration.customCharts.findIndex((chart) => chart.id === event.over?.id)
    if (destination < 0) return
    setConfiguration((current) => reorderChart(current, String(event.active.id), destination))
  }

  const editingChart = configuration.customCharts.find((chart) => chart.id === editingId)
  const deletingChart = configuration.customCharts.find((chart) => chart.id === deletingId)

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Create a custom chart</CardTitle>
          <CardDescription>
            Build transaction or wealth charts and keep their settings in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="new-chart-title">Chart title</Label>
            <Input
              id="new-chart-title"
              value={newTitle}
              placeholder="Example: Income and investments"
              onChange={(event) => setNewTitle(event.target.value)}
            />
          </div>
          <Button type="button" disabled={!newTitle.trim()} onClick={addChart}>
            <Plus className="size-4" /> Add chart
          </Button>
        </CardContent>
      </Card>

      {configuration.customCharts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No custom charts are configured. Add one above or reset the dashboard layout.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={configuration.customCharts.map((chart) => chart.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-6">
              {configuration.customCharts.map((chart, index) => (
                <SortableChartCard
                  key={chart.id}
                  chart={chart}
                  index={index}
                  count={configuration.customCharts.length}
                  onEdit={() => setEditingId(chart.id)}
                  onMove={(destination) =>
                    setConfiguration((current) => reorderChart(current, chart.id, destination))
                  }
                  onDelete={() => setDeletingId(chart.id)}
                >
                  {(actions) => (
                    <CustomChartRenderer
                      title={chart.title}
                      description="Monthly transaction and wealth data using this chart's filters."
                      data={renderedRows.get(chart.id) ?? []}
                      metrics={metrics}
                      settings={presentationFor(chart)}
                      actions={actions}
                    />
                  )}
                </SortableChartCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editingChart && (
        <ChartEditorDialog
          chart={editingChart}
          transactions={transactions}
          onChange={(changes) =>
            setConfiguration((current) => updateChart(current, editingChart.id, changes))
          }
          onClose={() => setEditingId(null)}
        />
      )}

      {deletingChart && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeletingId(null)
          }}
        >
          <dialog
            open
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chart-title"
            aria-describedby="delete-chart-description"
            className="relative m-0 w-full max-w-md rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle id="delete-chart-title">Delete chart?</CardTitle>
                <CardDescription id="delete-chart-description">
                  This permanently removes {deletingChart.title} and its saved settings from this
                  browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={() => setDeletingId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfiguration((current) => removeChart(current, deletingChart.id))
                    setDeletingId(null)
                  }}
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          </dialog>
        </div>
      )}
    </div>
  )
}
