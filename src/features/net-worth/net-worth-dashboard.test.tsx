import { fireEvent, render, screen, within } from "@testing-library/react"
import type React from "react"
import { describe, expect, it, vi } from "vitest"

import type { WealthSnapshot } from "@/domain/models"
import { NetWorthDashboard } from "@/features/net-worth/net-worth-dashboard"

vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>()
  return {
    ...original,
    AreaChart: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="wealth-chart">{children}</div>
    ),
    Area: ({ name }: { name?: string }) => <span>{name}</span>,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  }
})

function snapshot(
  series: WealthSnapshot["series"],
  date: string,
  valueMinor: number,
): WealthSnapshot {
  return {
    id: `${series}-${date}`,
    series,
    date,
    valueMinor,
    importBatchId: "synthetic-batch",
    fingerprint: `synthetic-${series}-${date}`,
    createdAt: `${date}T12:00:00.000Z`,
  }
}

const history = [
  snapshot("netWorth", "2026-01-01", 10_000_00),
  snapshot("investment", "2026-01-01", 2_000_00),
  snapshot("netWorth", "2026-07-01", 12_000_00),
  snapshot("investment", "2026-07-01", 3_000_00),
]

describe("NetWorthDashboard", () => {
  it("explains how to begin when no data has been imported", () => {
    render(<NetWorthDashboard snapshots={[]} today="2026-07-22" locale="en-US" />)
    expect(screen.getByRole("heading", { name: "No wealth history yet" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to Imports" })).toHaveAttribute("href", "/imports")
  })

  it("shows latest values, changes, allocation, and the full accessible table", () => {
    render(<NetWorthDashboard snapshots={history} today="2026-07-22" locale="en-US" />)
    expect(screen.getAllByText("$12,000.00")).toHaveLength(3)
    expect(screen.getAllByText("$3,000.00")).toHaveLength(3)
    expect(screen.getByText("25.0%")).toBeInTheDocument()
    expect(screen.getByText("+$2,000.00")).toBeInTheDocument()
    expect(screen.getByText("+$1,000.00")).toBeInTheDocument()

    const table = screen.getByRole("table", {
      name: "Net worth and investment values by observation date",
    })
    expect(within(table).getAllByRole("row")).toHaveLength(3)
    expect(within(table).getByText("Jan 1, 2026")).toBeInTheDocument()
  })

  it("supports all range controls and explains a range with no observations", () => {
    render(
      <NetWorthDashboard
        snapshots={[snapshot("netWorth", "2026-01-01", 10_000_00)]}
        today="2026-07-22"
        locale="en-US"
      />,
    )
    for (const range of ["1M", "3M", "6M", "YTD", "1Y", "All"]) {
      expect(screen.getByRole("button", { name: range })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole("button", { name: "1M" }))
    expect(screen.getByRole("heading", { name: "No observations in 1M" })).toBeInTheDocument()
  })

  it("toggles chart series independently", () => {
    render(<NetWorthDashboard snapshots={history} today="2026-07-22" locale="en-US" />)
    fireEvent.click(screen.getByRole("button", { name: "Edit Wealth history" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Net worth" }))
    expect(screen.getByTestId("wealth-chart")).toBeInTheDocument()
    expect(screen.queryByText("Net worth", { selector: "span" })).not.toBeInTheDocument()
    expect(screen.getByText("Investments", { selector: "span" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: "Investments" }))
    expect(
      screen.getByText("Select at least one metric to display this chart."),
    ).toBeInTheDocument()
  })

  it("announces stale, negative, and single-point states", () => {
    render(
      <NetWorthDashboard
        snapshots={[snapshot("netWorth", "2026-01-01", -500_00)]}
        today="2026-07-22"
        locale="en-US"
      />,
    )
    expect(screen.getByText(/latest observation is 202 days old/i)).toBeInTheDocument()
    expect(screen.getByText(/only one observation/i)).toBeInTheDocument()
    expect(screen.getByText(/includes a negative value/i)).toBeInTheDocument()
    expect(screen.getByText("One observation—change unavailable")).toBeInTheDocument()
  })
})
