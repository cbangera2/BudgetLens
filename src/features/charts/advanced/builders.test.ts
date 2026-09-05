import { describe, expect, it } from "vitest"

import { buildTransaction } from "@/test/factories"

import {
  buildHeatmapCells,
  buildRadarProfile,
  buildStackedCategoryRows,
  buildWaterfallNodes,
} from "./builders"

function expense(id: string, date: string, amountMinor: number, category: string) {
  return buildTransaction({ id, date, amountMinor: -Math.abs(amountMinor), category })
}

function income(id: string, date: string, amountMinor: number) {
  return buildTransaction({ id, date, amountMinor: Math.abs(amountMinor), category: "Paycheck" })
}

describe("buildStackedCategoryRows", () => {
  it("stacks the top categories monthly and rolls the rest into Other", () => {
    const transactions = [
      expense("a", "2026-01-05", 100_00, "Housing"),
      expense("b", "2026-01-06", 50_00, "Groceries"),
      expense("c", "2026-01-07", 10_00, "Coffee"),
      expense("d", "2026-02-05", 100_00, "Housing"),
      income("e", "2026-01-05", 500_00),
    ]
    const { rows, categories } = buildStackedCategoryRows(transactions, 2)
    expect(categories).toEqual(["Housing", "Groceries", "Other"])
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ month: "2026-01", category: "Housing", amount: 100 })
    expect(rows.find((row) => row.category === "Other")).toMatchObject({ amount: 10 })
  })

  it("returns no rows without expenses", () => {
    expect(buildStackedCategoryRows([income("e", "2026-01-05", 500_00)]).rows).toEqual([])
  })
})

describe("buildWaterfallNodes", () => {
  it("bridges income and expenses into savings with explicit endpoints", () => {
    const nodes = buildWaterfallNodes([
      income("a", "2026-01-01", 1000_00),
      expense("b", "2026-01-02", 400_00, "Housing"),
    ])
    expect(nodes).toEqual([
      { label: "Income", start: 0, end: 1000, kind: "increase" },
      { label: "Expenses", start: 1000, end: 600, kind: "decrease" },
      { label: "Savings", start: 0, end: 600, kind: "total" },
    ])
  })

  it("returns no nodes without transactions", () => {
    expect(buildWaterfallNodes([])).toEqual([])
  })
})

describe("buildRadarProfile", () => {
  it("normalizes the top categories and closes the polygon", () => {
    const transactions = [
      expense("a", "2026-01-01", 400_00, "Housing"),
      expense("b", "2026-01-02", 200_00, "Groceries"),
      expense("c", "2026-01-03", 100_00, "Travel"),
    ]
    const { points, maximum } = buildRadarProfile(transactions, 6)
    expect(maximum).toBe(400)
    expect(points.map((point) => point.category)).toEqual([
      "Housing",
      "Groceries",
      "Travel",
      "Housing",
    ])
    expect(points[0]?.share).toBe(1)
    expect(points[2]?.share).toBeCloseTo(0.25)
    expect(new Set(points.map((point) => point.id)).size).toBe(points.length)
  })

  it("requires at least three categories", () => {
    const { points } = buildRadarProfile([expense("a", "2026-01-01", 100_00, "Housing")])
    expect(points).toEqual([])
  })
})

describe("buildHeatmapCells", () => {
  it("buckets daily totals into intensity levels across weekday rows", () => {
    const transactions = [
      expense("a", "2026-01-05", 10_00, "Food"),
      expense("b", "2026-01-06", 20_00, "Food"),
      expense("c", "2026-01-07", 30_00, "Food"),
      expense("d", "2026-01-08", 40_00, "Food"),
    ]
    const { cells, weeks } = buildHeatmapCells(transactions)
    expect(cells).toHaveLength(4)
    expect(weeks).toHaveLength(1)
    expect(cells[0]).toMatchObject({ weekday: "Mon", level: "Low" })
    expect(cells[3]).toMatchObject({ weekday: "Thu", level: "Peak" })
  })

  it("orders cells chronologically so the week axis reads left to right", () => {
    const transactions = [
      expense("b", "2026-02-03", 20_00, "Food"),
      expense("a", "2026-01-05", 10_00, "Food"),
    ]
    const { cells, weeks } = buildHeatmapCells(transactions)
    expect(cells.map((cell) => cell.day)).toEqual(["2026-01-05", "2026-02-03"])
    expect(weeks).toEqual([...weeks].toSorted())
  })

  it("returns no cells without expenses", () => {
    expect(buildHeatmapCells([]).cells).toEqual([])
  })
})
