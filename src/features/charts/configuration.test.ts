import {
  CHART_METRICS,
  CHART_TYPES,
  DASHBOARD_MODULES,
  DEFAULT_DASHBOARD_CONFIGURATION,
  VALUE_DISPLAYS,
  createChart,
  createDefaultChart,
  deserializeDashboardConfiguration,
  normalizeChartConfiguration,
  normalizeDashboardConfiguration,
  removeChart,
  reorderChart,
  reorderDashboardModule,
  setDashboardModuleHidden,
  updateChart,
} from "./index"

describe("chart configuration", () => {
  it("provides every required chart option and an independent default chart", () => {
    expect(CHART_TYPES).toEqual(["bar-vertical", "bar-horizontal", "line", "area", "pie"])
    expect(CHART_METRICS).toEqual(["income", "expenses", "savings", "netWorth", "investments"])
    expect(VALUE_DISPLAYS).toEqual(["none", "value", "percentage", "both"])

    const first = createDefaultChart("first")
    const second = createDefaultChart("second")
    first.appearance.palette.push("#000000")
    first.filters.categories.push("Food")
    expect(second.appearance.palette).not.toContain("#000000")
    expect(second.filters.categories).toEqual([])
  })

  it("normalizes untrusted chart fields, bounds dimensions, and repairs date order", () => {
    const result = normalizeChartConfiguration({
      id: "  chart-one  ",
      title: "  Spending  ",
      type: "radar",
      metrics: ["income", "income", "bogus", "netWorth"],
      valueDisplay: "both",
      filters: {
        categories: [" Food ", "Food", 4, ""],
        descriptions: ["Market"],
        transactionTypes: ["Debit"],
        date: { start: "2026-12-01", end: "2026-01-02" },
      },
      appearance: {
        showGrid: false,
        showLegend: false,
        palette: ["#123", "javascript:bad", "var(--chart-1)"],
        labelColor: "invalid",
        size: "custom",
        height: 9_000,
        width: 1,
        areaFill: "invalid",
      },
    })

    expect(result).toMatchObject({
      id: "chart-one",
      title: "Spending",
      type: "bar-vertical",
      metrics: ["income", "netWorth"],
      valueDisplay: "both",
      filters: {
        categories: ["Food"],
        descriptions: ["Market"],
        transactionTypes: ["Debit"],
        date: { start: "2026-01-02", end: "2026-12-01" },
      },
      appearance: {
        showGrid: false,
        showLegend: false,
        palette: ["#123", "var(--chart-1)"],
        labelColor: "#475569",
        size: "custom",
        height: 2_000,
        width: 240,
        areaFill: "gradient",
      },
    })
  })

  it("normalizes a versioned dashboard and retains all built-in modules", () => {
    const result = normalizeDashboardConfiguration({
      version: 0,
      moduleOrder: ["wealth", "summary", "wealth", "unknown"],
      hiddenModules: ["budgets", "bogus", "budgets"],
      customCharts: [
        { id: "a", type: "line", metrics: ["netWorth"] },
        { id: "a", type: "pie" },
        null,
      ],
    })

    expect(result.version).toBe(1)
    expect(result.moduleOrder).toEqual([
      "wealth",
      "summary",
      ...DASHBOARD_MODULES.filter((module) => !["wealth", "summary"].includes(module)),
    ])
    expect(result.hiddenModules).toEqual(["budgets"])
    expect(result.customCharts).toHaveLength(2)
    expect(result.customCharts.map((chart) => chart.id)).toEqual(["a", "chart-3"])
  })

  it("safely deserializes invalid, valid, and unsupported future localStorage content", () => {
    expect(deserializeDashboardConfiguration("not json")).toEqual(
      normalizeDashboardConfiguration(DEFAULT_DASHBOARD_CONFIGURATION),
    )
    expect(
      deserializeDashboardConfiguration(JSON.stringify({ version: 99, customCharts: [] })),
    ).toEqual(normalizeDashboardConfiguration(DEFAULT_DASHBOARD_CONFIGURATION))
    expect(
      deserializeDashboardConfiguration(JSON.stringify({ version: 1, hiddenModules: ["cashFlow"] }))
        .hiddenModules,
    ).toEqual(["cashFlow"])
  })

  it("creates, updates, removes, and reorders charts immutably", () => {
    const base = normalizeDashboardConfiguration(undefined)
    const withA = createChart(base, { id: "a", title: "A", metrics: ["income"] })
    const withBoth = createChart(withA, { id: "b", title: "B", type: "area" })

    expect(base.customCharts).toEqual([])
    expect(createChart(withBoth, { id: "a" })).toBe(withBoth)
    const updated = updateChart(withBoth, "a", {
      title: "Income trend",
      type: "line",
      metrics: ["income", "savings"],
    })
    expect(updated.customCharts[0]).toMatchObject({
      id: "a",
      title: "Income trend",
      type: "line",
      metrics: ["income", "savings"],
    })
    expect(withBoth.customCharts[0]?.title).toBe("A")

    const reordered = reorderChart(updated, "b", 0)
    expect(reordered.customCharts.map((chart) => chart.id)).toEqual(["b", "a"])
    expect(reorderChart(reordered, "missing", 0)).toBe(reordered)
    expect(removeChart(reordered, "a").customCharts.map((chart) => chart.id)).toEqual(["b"])
  })

  it("reorders and hides dashboard modules", () => {
    const base = normalizeDashboardConfiguration(undefined)
    const moved = reorderDashboardModule(base, "wealth", 0)
    expect(moved.moduleOrder[0]).toBe("wealth")
    const hidden = setDashboardModuleHidden(moved, "wealth", true)
    expect(hidden.hiddenModules).toEqual(["wealth"])
    expect(setDashboardModuleHidden(hidden, "wealth", false).hiddenModules).toEqual([])
  })
})
