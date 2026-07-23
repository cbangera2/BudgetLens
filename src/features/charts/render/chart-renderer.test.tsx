import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type React from "react"
import { describe, expect, it, vi } from "vitest"

import {
  CustomChartRenderer,
  type ChartPresentationSettings,
} from "@/features/charts/render/chart-renderer"
import { ChartSettingsEditor } from "@/features/charts/render/chart-settings-editor"
import { EditableChartRenderer } from "@/features/charts/render/editable-chart-renderer"

vi.mock("recharts", () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- mock factory is hoisted
  const Chart = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- mock factory is hoisted
  const Series = ({
    children,
    name,
    fill,
    fillOpacity,
  }: {
    children?: React.ReactNode
    name?: string
    fill?: string
    fillOpacity?: number
  }) => (
    <div data-series={name} data-fill={fill} data-fill-opacity={fillOpacity}>
      {children}
    </div>
  )
  return {
    Area: Series,
    AreaChart: Chart,
    Bar: Series,
    BarChart: Chart,
    CartesianGrid: () => null,
    Cell: ({ fill }: { fill?: string }) => <span data-cell-fill={fill} />,
    LabelList: () => null,
    Legend: () => null,
    Line: Series,
    LineChart: Chart,
    Pie: Series,
    PieChart: Chart,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  }
})

const settings: ChartPresentationSettings = {
  kind: "area",
  barDirection: "vertical",
  metricKeys: ["amount"],
  palette: "default",
  labelDisplay: "value",
  labelColor: "#000000",
  legend: "bottom",
  grid: "horizontal",
  pieLabelPosition: "outside",
  areaFill: "gradient",
  animationDuration: 0,
  size: "medium",
  height: 360,
  width: { mode: "auto" },
}

const metrics = [
  {
    key: "amount",
    label: "Amount",
    formatValue: (value: number) => `$${value.toFixed(2)}`,
  },
  { key: "count", label: "Count" },
]

describe("CustomChartRenderer", () => {
  it("shows a useful empty state when no metric is selected", () => {
    render(
      <CustomChartRenderer
        title="Spending"
        data={[]}
        metrics={metrics}
        settings={{ ...settings, metricKeys: [] }}
      />,
    )

    expect(
      screen.getByText("Select at least one metric to display this chart."),
    ).toBeInTheDocument()
  })

  it("provides the selected chart data as an accessible table", () => {
    render(
      <CustomChartRenderer
        title="Spending"
        data={[{ id: "food", label: "Food", values: { amount: 42.5, count: 3 } }]}
        metrics={metrics}
        settings={settings}
        tableInitiallyOpen
      />,
    )

    const table = screen.getByRole("table", { name: "Data shown in Spending" })
    expect(within(table).getByRole("columnheader", { name: "Amount" })).toBeInTheDocument()
    expect(within(table).getByRole("rowheader", { name: "Food" })).toBeInTheDocument()
    expect(within(table).getByText("$42.50")).toBeInTheDocument()
    expect(within(table).queryByRole("columnheader", { name: "Count" })).not.toBeInTheDocument()
  })

  it("uses a unique shadcn-style gradient for every area series", () => {
    const { container } = render(
      <CustomChartRenderer
        title="Trends"
        data={[{ id: "july", label: "July", values: { amount: 42.5, count: 3 } }]}
        metrics={metrics}
        settings={{ ...settings, metricKeys: ["amount", "count"] }}
      />,
    )

    const gradients = [...container.querySelectorAll("linearGradient")]
    expect(gradients).toHaveLength(2)
    expect(new Set(gradients.map((gradient) => gradient.id)).size).toBe(2)
    expect(container.querySelectorAll('stop[stop-opacity="0.8"]')).toHaveLength(2)
    expect(container.querySelectorAll('stop[stop-opacity="0.1"]')).toHaveLength(2)
  })

  it("uses a distinct palette color for every pie slice", () => {
    const { container } = render(
      <CustomChartRenderer
        title="Categories"
        data={[
          { id: "food", label: "Food", values: { amount: 42.5 } },
          { id: "travel", label: "Travel", values: { amount: 30 } },
          { id: "home", label: "Home", values: { amount: 20 } },
        ]}
        metrics={metrics}
        settings={{ ...settings, kind: "pie", palette: "rainbow" }}
      />,
    )

    const fills = [...container.querySelectorAll("[data-cell-fill]")].map((cell) =>
      cell.getAttribute("data-cell-fill"),
    )
    expect(fills).toHaveLength(3)
    expect(new Set(fills).size).toBe(3)
  })

  it("supports gradient, solid, and disabled area fills", () => {
    const { container, rerender } = render(
      <CustomChartRenderer
        title="Trends"
        data={[{ id: "july", label: "July", values: { amount: 42.5 } }]}
        metrics={metrics}
        settings={{ ...settings, areaFill: "solid" }}
      />,
    )
    expect(container.querySelector('[data-series="Amount"]')).toHaveAttribute(
      "data-fill",
      "var(--color-amount)",
    )
    expect(container.querySelector('[data-series="Amount"]')).toHaveAttribute(
      "data-fill-opacity",
      "0.18",
    )

    rerender(
      <CustomChartRenderer
        title="Trends"
        data={[{ id: "july", label: "July", values: { amount: 42.5 } }]}
        metrics={metrics}
        settings={{ ...settings, areaFill: "none" }}
      />,
    )
    expect(container.querySelector('[data-series="Amount"]')).toHaveAttribute(
      "data-fill",
      "transparent",
    )
  })
})

describe("ChartSettingsEditor", () => {
  it("reports typed chart and grid changes", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(next: ChartPresentationSettings) => void>()
    const { rerender } = render(
      <ChartSettingsEditor value={settings} metrics={metrics} onChange={onChange} />,
    )

    await user.click(screen.getByLabelText("Chart type"))
    await user.click(screen.getByRole("option", { name: "Bar" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, kind: "bar" })

    const barSettings = { ...settings, kind: "bar" as const }
    rerender(<ChartSettingsEditor value={barSettings} metrics={metrics} onChange={onChange} />)
    await user.click(screen.getByLabelText("Grid lines"))
    await user.click(screen.getByRole("option", { name: "Horizontal and vertical" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...barSettings, grid: "both" })
  })

  it("supports multi-select metrics and reset", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(next: ChartPresentationSettings) => void>()
    const onReset = vi.fn<() => void>()
    render(
      <ChartSettingsEditor
        value={settings}
        metrics={metrics}
        onChange={onChange}
        onReset={onReset}
      />,
    )

    await user.click(screen.getByRole("checkbox", { name: "Count" }))
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      metricKeys: ["amount", "count"],
    })
    await user.click(screen.getByRole("button", { name: "Reset" }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it("offers area fill controls", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(next: ChartPresentationSettings) => void>()
    render(<ChartSettingsEditor value={settings} metrics={metrics} onChange={onChange} />)

    await user.click(screen.getByLabelText("Area fill"))
    await user.click(screen.getByRole("option", { name: "None" }))
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, areaFill: "none" })
  })
})

describe("EditableChartRenderer", () => {
  it("shows a persistent edit control and restores saved settings", async () => {
    localStorage.clear()
    const user = userEvent.setup()
    const props = {
      storageKey: "test.editable-chart",
      title: "Always editable",
      data: [{ id: "july", label: "July", values: { amount: 42.5 } }],
      metrics,
      initialSettings: settings,
    }
    const { unmount } = render(<EditableChartRenderer {...props} />)

    await user.click(screen.getByRole("button", { name: "Edit Always editable" }))
    await user.click(screen.getByLabelText("Area fill"))
    await user.click(screen.getByRole("option", { name: "None" }))
    expect(localStorage.getItem("test.editable-chart")).toContain('"areaFill":"none"')
    unmount()

    render(<EditableChartRenderer {...props} />)
    await user.click(screen.getByRole("button", { name: "Edit Always editable" }))
    expect(screen.getByLabelText("Area fill")).toHaveTextContent("None")
  })
})
