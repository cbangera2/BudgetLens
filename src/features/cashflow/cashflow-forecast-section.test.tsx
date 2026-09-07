import { fireEvent, render, screen } from "@testing-library/react"
import type React from "react"
import { describe, expect, it, vi } from "vitest"

import { buildTransaction } from "@/test/factories"

import { CashflowForecastSection } from "./cashflow-forecast-section"
import { CASHFLOW_CUSHION_STORAGE_KEY } from "./cushion"

vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>()
  return {
    ...original,
    LineChart: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="forecast-chart">{children}</div>
    ),
    Line: ({ name }: { name?: string }) => <span>{name}</span>,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ReferenceArea: () => null,
    ReferenceLine: () => null,
  }
})

function expense(id: string, date: string, description: string, amountMinor = -8_000) {
  return buildTransaction({ id, date, description, amountMinor, transactionType: "Debit" })
}

const recurringTransactions = [
  expense("f1", "2026-01-15", "Forecast Streaming"),
  expense("f2", "2026-02-15", "Forecast Streaming"),
  expense("f3", "2026-03-15", "Forecast Streaming"),
  expense("f4", "2026-04-15", "Forecast Streaming"),
  buildTransaction({
    id: "pay",
    date: "2026-04-10",
    description: "Example Paycheck",
    amountMinor: 30_000,
    category: "Income",
    transactionType: "Credit",
  }),
]

describe("CashflowForecastSection", () => {
  it("renders the projection line, cushion warning, and assumptions", () => {
    window.localStorage.clear()
    render(
      <CashflowForecastSection
        transactions={recurringTransactions}
        goals={[]}
        today="2026-04-20"
      />,
    )

    expect(screen.getByRole("region", { name: "Cash-flow forecast" })).toBeInTheDocument()
    expect(screen.getByTestId("forecast-chart")).toBeInTheDocument()
    expect(screen.getAllByText("Actual balance").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Projected balance").length).toBeGreaterThan(0)
    expect(screen.getByRole("alert")).toHaveTextContent(/below/)
    expect(screen.getByText("What this assumes")).toBeInTheDocument()
    expect(screen.getByLabelText(/Low-balance cushion/)).toBeInTheDocument()
  })

  it("persists cushion changes and updates the warning", () => {
    window.localStorage.clear()
    render(
      <CashflowForecastSection
        transactions={recurringTransactions}
        goals={[]}
        today="2026-04-20"
      />,
    )

    const input = screen.getByLabelText(/Low-balance cushion/)
    const before = screen.getByRole("alert").textContent
    fireEvent.change(input, { target: { value: "1000" } })

    expect(window.localStorage.getItem(CASHFLOW_CUSHION_STORAGE_KEY)).toBe("100000")
    const after = screen.queryByRole("alert")?.textContent ?? "stayed above"
    expect(after).toContain("$1,000")
    expect(after).not.toBe(before)
  })

  it("shows a stay-above note when the cushion is cleared to zero and the trend rises", () => {
    window.localStorage.clear()
    const rising = [
      buildTransaction({
        id: "big-pay",
        date: "2026-04-10",
        description: "Example Paycheck",
        amountMinor: 900_000,
        category: "Income",
        transactionType: "Credit",
      }),
    ]
    render(<CashflowForecastSection transactions={rising} goals={[]} today="2026-04-20" />)

    fireEvent.change(screen.getByLabelText(/Low-balance cushion/), { target: { value: "0" } })
    expect(screen.getByText(/stay above/)).toBeInTheDocument()
  })
})
