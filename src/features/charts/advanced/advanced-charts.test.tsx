import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { buildTransaction } from "@/test/factories"

import {
  CashFlowWaterfall,
  DailyHeatmap,
  SavingsGauge,
  SpendingRadar,
  SpendingTreemap,
  StackedCategoryBars,
  TopCategoriesLollipop,
} from "./advanced-charts"

vi.mock("@tanstack/charts/react", () => ({
  Chart: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="tanstack-chart" aria-label={ariaLabel} />
  ),
}))

function expense(id: string, date: string, amountMinor: number, category: string) {
  return buildTransaction({ id, date, amountMinor: -Math.abs(amountMinor), category })
}

const sample = [
  expense("a", "2026-01-05", 400_00, "Housing"),
  expense("b", "2026-01-06", 200_00, "Groceries"),
  expense("c", "2026-01-07", 100_00, "Travel"),
  expense("d", "2026-02-05", 150_00, "Housing"),
  buildTransaction({ id: "e", date: "2026-01-01", amountMinor: 1000_00, category: "Paycheck" }),
]

const cases = [
  { Component: StackedCategoryBars, empty: "No expense activity to stack yet." },
  { Component: CashFlowWaterfall, empty: "Import transactions to see the cash-flow bridge." },
  { Component: SpendingRadar, empty: "Add spending in at least three categories" },
  { Component: DailyHeatmap, empty: "No daily expenses to map yet." },
  { Component: SavingsGauge, empty: "Add income to measure a savings rate." },
  { Component: SpendingTreemap, empty: "No expenses to tile yet." },
  { Component: TopCategoriesLollipop, empty: "No ranked expenses yet." },
] as const

describe("advanced charts", () => {
  it("renders friendly empty states without throwing on empty input", () => {
    for (const { Component, empty } of cases) {
      const { unmount } = render(<Component transactions={[]} />)
      expect(screen.getByText(empty, { exact: false })).toBeInTheDocument()
      unmount()
    }
  })

  it("renders a TanStack surface once data arrives", () => {
    for (const { Component } of cases) {
      const { unmount } = render(<Component transactions={sample} />)
      expect(screen.getByTestId("tanstack-chart")).toBeInTheDocument()
      unmount()
    }
  })
})
