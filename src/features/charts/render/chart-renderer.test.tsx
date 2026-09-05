import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  CustomChartRenderer,
  type ChartPresentationSettings,
} from "@/features/charts/render/chart-renderer"
import { ChartSettingsEditor } from "@/features/charts/render/chart-settings-editor"
import { EditableChartRenderer } from "@/features/charts/render/editable-chart-renderer"

vi.mock("@tanstack/charts/react", () => ({
  Chart: ({ ariaLabel, definition }: { ariaLabel?: string; definition?: unknown }) => (
    <div
      data-testid="tanstack-chart"
      aria-label={ariaLabel}
      data-definition={definition ? "present" : "missing"}
    />
  ),
}))

vi.mock("@tanstack/charts/polar", async (importOriginal) => {
  const original = await importOriginal<typeof import("@tanstack/charts/polar")>()
  return original
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

  it("renders a TanStack chart surface for cartesian charts", () => {
    render(
      <CustomChartRenderer
        title="Trends"
        data={[{ id: "july", label: "July", values: { amount: 42.5, count: 3 } }]}
        metrics={metrics}
        settings={{ ...settings, metricKeys: ["amount", "count"] }}
      />,
    )

    expect(screen.getByTestId("tanstack-chart")).toBeInTheDocument()
    expect(screen.getByTestId("chart-legend")).toBeInTheDocument()
  })

  it("renders a distinct legend entry for every selected metric", () => {
    render(
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

    const legend = screen.getByTestId("chart-legend")
    expect(within(legend).getByText("Amount")).toBeInTheDocument()
    expect(screen.getByTestId("tanstack-chart")).toBeInTheDocument()
  })

  it("hides the legend when placement is hidden", () => {
    render(
      <CustomChartRenderer
        title="Trends"
        data={[{ id: "july", label: "July", values: { amount: 42.5 } }]}
        metrics={metrics}
        settings={{ ...settings, legend: "hidden" }}
      />,
    )
    expect(screen.queryByTestId("chart-legend")).not.toBeInTheDocument()
    expect(screen.getByTestId("tanstack-chart")).toBeInTheDocument()
  })

  it("supports all legend placements without regressions", () => {
    for (const legend of ["top", "bottom", "left", "right"] as const) {
      const { unmount } = render(
        <CustomChartRenderer
          title="Trends"
          data={[{ id: "july", label: "July", values: { amount: 42.5 } }]}
          metrics={metrics}
          settings={{ ...settings, legend }}
        />,
      )
      expect(screen.getByTestId("chart-legend")).toBeInTheDocument()
      unmount()
    }
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
