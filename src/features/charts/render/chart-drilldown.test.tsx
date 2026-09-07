import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  chartDrilldownHref,
  CustomChartRenderer,
  type ChartPresentationSettings,
} from "@/features/charts/render/chart-renderer"

type ClickHandler = (datum: unknown, index: number) => void

const captured = vi.hoisted(
  (): { pie: { onClick?: ClickHandler }[]; bar: { onClick?: ClickHandler }[] } => ({
    pie: [],
    bar: [],
  }),
)

vi.mock("recharts", () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- mock factory is hoisted
  const Chart = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- mock factory is hoisted
  const Series = ({ children, name }: { children?: React.ReactNode; name?: string }) => (
    <div data-series={name}>{children}</div>
  )
  const PieMock = ({
    children,
    onClick,
  }: {
    children?: React.ReactNode
    onClick?: ClickHandler
  }) => {
    captured.pie.push(onClick ? { onClick } : {})
    return <div data-mock-pie>{children}</div>
  }
  const BarMock = ({
    children,
    onClick,
  }: {
    children?: React.ReactNode
    onClick?: ClickHandler
  }) => {
    captured.bar.push(onClick ? { onClick } : {})
    return <div data-mock-bar>{children}</div>
  }
  return {
    Area: Series,
    AreaChart: Chart,
    Bar: BarMock,
    BarChart: Chart,
    CartesianGrid: () => null,
    Cell: () => null,
    LabelList: () => null,
    Legend: () => null,
    Line: Series,
    LineChart: Chart,
    Pie: PieMock,
    PieChart: Chart,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  }
})

const baseSettings: ChartPresentationSettings = {
  kind: "pie",
  barDirection: "vertical",
  metricKeys: ["amount"],
  palette: "default",
  labelDisplay: "none",
  labelColor: "#000000",
  legend: "bottom",
  grid: "none",
  pieLabelPosition: "outside",
  areaFill: "gradient",
  animationDuration: 0,
  size: "medium",
  height: 300,
  width: { mode: "auto" },
}

const metrics = [{ key: "amount", label: "Amount" }]

const categoryRows = [
  { id: "groceries", label: "Groceries", values: { amount: 42.5 } },
  { id: "Food & Drink", label: "Food & Drink", values: { amount: 30 } },
  {
    id: `Kids' "Corner", North/South`,
    label: `Kids' "Corner", North/South`,
    values: { amount: 20 },
  },
]

const originalLocation = Object.getOwnPropertyDescriptor(window, "location")
const assign = vi.fn<(url: string) => void>()

function stubNavigation() {
  assign.mockClear()
  captured.pie.length = 0
  captured.bar.length = 0
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { assign },
  })
}

afterEach(() => {
  if (originalLocation) Object.defineProperty(window, "location", originalLocation)
})

describe("chartDrilldownHref", () => {
  it("maps a category to the existing transactions filter URL", () => {
    expect(chartDrilldownHref("Groceries")).toBe("/transactions?category=Groceries")
  })

  it("round-trips special characters through the category param", () => {
    const tricky = [`Food & Drink`, `Kids' "Corner", North/South`, `Café`, `A+B=C`, `100%`]
    for (const category of tricky) {
      const href = chartDrilldownHref(category)
      expect(href).not.toBeNull()
      const parsed = new URL(href ?? "", "http://localhost").searchParams.get("category")
      expect(parsed).toBe(category)
    }
    expect(chartDrilldownHref("Food & Drink")).toBe("/transactions?category=Food+%26+Drink")
  })

  it("leaves rows without an expressible filter unlinked", () => {
    expect(chartDrilldownHref("")).toBeNull()
    expect(chartDrilldownHref("   ")).toBeNull()
    expect(chartDrilldownHref("2026-01")).toBeNull()
    expect(chartDrilldownHref("2026-01-03")).toBeNull()
    expect(chartDrilldownHref("totals")).toBeNull()
    expect(chartDrilldownHref("123e4567-e89b-12d3-a456-426614174000")).toBeNull()
  })
})

describe("CustomChartRenderer drilldown", () => {
  it("lists adjacent keyboard-accessible links for pie slices", async () => {
    const user = userEvent.setup()
    render(
      <CustomChartRenderer
        title="Categories"
        data={categoryRows}
        metrics={metrics}
        settings={baseSettings}
      />,
    )

    const nav = screen.getByRole("navigation", { name: "View transactions for Categories" })
    const links = within(nav).getAllByRole("link")
    expect(links).toHaveLength(3)
    expect(links[0]).toHaveTextContent("Groceries")
    expect(links[0]?.getAttribute("href")).toBe(chartDrilldownHref("groceries"))
    expect(links[1]?.getAttribute("href")).toBe(chartDrilldownHref("Food & Drink"))
    expect(links[2]?.getAttribute("href")).toBe(chartDrilldownHref(`Kids' "Corner", North/South`))

    await user.tab()
    expect(links[0]).toHaveFocus()
    await user.tab()
    expect(links[1]).toHaveFocus()
    await user.tab()
    expect(links[2]).toHaveFocus()
  })

  it("navigates to the clicked slice category", () => {
    stubNavigation()
    render(
      <CustomChartRenderer
        title="Categories"
        data={categoryRows}
        metrics={metrics}
        settings={baseSettings}
      />,
    )

    expect(captured.pie).toHaveLength(1)
    captured.pie[0]?.onClick?.({}, 1)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith(chartDrilldownHref("Food & Drink"))
  })

  it("ignores clicks without a matching slice", () => {
    stubNavigation()
    render(
      <CustomChartRenderer
        title="Categories"
        data={categoryRows}
        metrics={metrics}
        settings={baseSettings}
      />,
    )

    captured.pie[0]?.onClick?.({}, 99)
    expect(assign).not.toHaveBeenCalled()
  })

  it("links bars by category and navigates on bar click", async () => {
    stubNavigation()
    const user = userEvent.setup()
    render(
      <CustomChartRenderer
        title="Category bars"
        data={categoryRows}
        metrics={metrics}
        settings={{ ...baseSettings, kind: "bar" }}
      />,
    )

    const nav = screen.getByRole("navigation", { name: "View transactions for Category bars" })
    expect(within(nav).getAllByRole("link")).toHaveLength(3)
    await user.tab()
    expect(within(nav).getAllByRole("link")[0]).toHaveFocus()

    expect(captured.bar).toHaveLength(1)
    captured.bar[0]?.onClick?.({}, 0)
    expect(assign).toHaveBeenCalledWith(chartDrilldownHref("groceries"))
  })

  it("leaves period bars unlinked instead of fabricating a filter", () => {
    stubNavigation()
    render(
      <CustomChartRenderer
        title="Monthly"
        data={[
          { id: "2026-01", label: "Jan 2026", values: { amount: 10 } },
          { id: "2026-02", label: "Feb 2026", values: { amount: 12 } },
        ]}
        metrics={metrics}
        settings={{ ...baseSettings, kind: "bar" }}
      />,
    )

    expect(
      screen.queryByRole("navigation", { name: "View transactions for Monthly" }),
    ).not.toBeInTheDocument()
    captured.bar[0]?.onClick?.({}, 0)
    expect(assign).not.toHaveBeenCalled()
  })

  it("stays unlinked for line and area charts by default", () => {
    render(
      <CustomChartRenderer
        title="Trends"
        data={categoryRows}
        metrics={metrics}
        settings={{ ...baseSettings, kind: "area" }}
      />,
    )

    expect(
      screen.queryByRole("navigation", { name: "View transactions for Trends" }),
    ).not.toBeInTheDocument()
  })

  it("supports disabling and custom resolvers", () => {
    const { rerender } = render(
      <CustomChartRenderer
        title="Categories"
        data={categoryRows}
        metrics={metrics}
        settings={baseSettings}
        drilldown={false}
      />,
    )
    expect(
      screen.queryByRole("navigation", { name: "View transactions for Categories" }),
    ).not.toBeInTheDocument()

    rerender(
      <CustomChartRenderer
        title="Categories"
        data={categoryRows}
        metrics={metrics}
        settings={{ ...baseSettings, kind: "area" }}
        drilldown={(row) => `/transactions?q=${encodeURIComponent(row.id)}`}
      />,
    )
    const nav = screen.getByRole("navigation", { name: "View transactions for Categories" })
    expect(within(nav).getAllByRole("link")).toHaveLength(3)
    expect(within(nav).getAllByRole("link")[0]?.getAttribute("href")).toBe(
      "/transactions?q=groceries",
    )
  })
})
