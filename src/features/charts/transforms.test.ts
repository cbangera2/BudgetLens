import type { Transaction, WealthSnapshot } from "@/domain/models"

import { createDefaultChart } from "./configuration"
import {
  buildCategoryChartData,
  buildMonthlyChartData,
  filterChartTransactions,
} from "./transforms"

function transaction(
  id: string,
  date: string,
  amountMinor: number,
  category: string | null,
  description = "Vendor",
  transactionType: string | null = "Card",
): Transaction {
  return {
    id,
    date,
    amountMinor,
    category,
    description,
    transactionType,
    accountName: null,
    accountType: null,
    provider: null,
    labels: [],
    notes: null,
    importBatchId: "test",
    fingerprint: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function wealth(
  id: string,
  date: string,
  valueMinor: number,
  series: WealthSnapshot["series"],
): WealthSnapshot {
  return {
    id,
    date,
    valueMinor,
    series,
    importBatchId: "test",
    fingerprint: id,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

const transactions = [
  transaction("salary", "2026-01-05", 500_050, "Salary", "Employer", "Deposit"),
  transaction("food", "2026-01-10", -12_345, "Food", "Market", "Card"),
  transaction("rent", "2026-01-15", -100_000, "Housing", "Landlord", "ACH"),
  transaction("feb-food", "2026-02-10", -5_055, "Food", "Market", "Card"),
  transaction("uncategorized", "2026-02-12", -1_000, null, "Other", "Card"),
]

describe("chart data transforms", () => {
  it("applies category, description, type, and date filters together", () => {
    const filters = createDefaultChart("filter").filters
    filters.categories = ["Food"]
    filters.descriptions = ["Market"]
    filters.transactionTypes = ["Card"]
    filters.date = { start: "2026-02-01", end: "2026-02-28" }
    expect(filterChartTransactions(transactions, filters).map(({ id }) => id)).toEqual(["feb-food"])
  })

  it("aggregates monthly cash flow in cents then emits renderer values in dollars", () => {
    const points = buildMonthlyChartData(transactions, [], createDefaultChart("chart").filters)
    expect(points).toEqual([
      {
        month: "2026-01",
        income: 5000.5,
        expenses: 1123.45,
        savings: 3877.05,
        netWorth: null,
        investments: null,
      },
      {
        month: "2026-02",
        income: 0,
        expenses: 60.55,
        savings: -60.55,
        netWorth: null,
        investments: null,
      },
    ])
  })

  it("treats absolute Credit Karma debit amounts as expenses", () => {
    const imported = [
      transaction("debit", "2026-03-01", 2_500, "Dining", "Cafe", "debit"),
      transaction("credit", "2026-03-02", 10_000, "Income", "Employer", "CREDIT"),
    ]
    const filters = createDefaultChart("chart").filters

    expect(buildMonthlyChartData(imported, [], filters)).toEqual([
      {
        month: "2026-03",
        income: 100,
        expenses: 25,
        savings: 75,
        netWorth: null,
        investments: null,
      },
    ])
    expect(buildCategoryChartData(imported, filters, "expenses")).toEqual([
      { category: "Dining", value: 25, percentage: 1 },
    ])
  })

  it("joins the latest monthly wealth values with transaction months", () => {
    const snapshots = [
      wealth("nw-old", "2026-01-01", 1_000_000, "netWorth"),
      wealth("nw-new", "2026-01-31", 1_250_025, "netWorth"),
      wealth("inv", "2026-01-20", 300_010, "investment"),
      wealth("march", "2026-03-02", 1_500_000, "netWorth"),
    ]
    const points = buildMonthlyChartData(
      transactions,
      snapshots,
      createDefaultChart("chart").filters,
    )
    expect(points.find(({ month }) => month === "2026-01")).toMatchObject({
      netWorth: 12500.25,
      investments: 3000.1,
    })
    expect(points.find(({ month }) => month === "2026-03")).toEqual({
      month: "2026-03",
      income: 0,
      expenses: 0,
      savings: 0,
      netWorth: 15000,
      investments: null,
    })
  })

  it("applies date filters to both transaction and wealth inputs", () => {
    const filters = createDefaultChart("chart").filters
    filters.date = { start: "2026-02-01", end: "2026-02-28" }
    const points = buildMonthlyChartData(
      transactions,
      [wealth("jan", "2026-01-31", 100, "netWorth"), wealth("feb", "2026-02-28", 200, "netWorth")],
      filters,
    )
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ month: "2026-02", netWorth: 2 })
  })

  it("creates sorted, positive pie slices with category percentages", () => {
    const result = buildCategoryChartData(
      transactions,
      createDefaultChart("chart").filters,
      "expenses",
    )
    expect(result).toEqual([
      { category: "Housing", value: 1000, percentage: 100_000 / 118_400 },
      { category: "Food", value: 174, percentage: 17_400 / 118_400 },
      { category: "Uncategorized", value: 10, percentage: 1_000 / 118_400 },
    ])
    expect(result.reduce((sum, point) => sum + point.percentage, 0)).toBeCloseTo(1)
  })

  it("builds income and savings slices while rejecting meaningless wealth categories", () => {
    const filters = createDefaultChart("chart").filters
    expect(buildCategoryChartData(transactions, filters, "income")).toEqual([
      { category: "Salary", value: 5000.5, percentage: 1 },
    ])
    expect(buildCategoryChartData(transactions, filters, "savings")).toEqual([
      { category: "Salary", value: 5000.5, percentage: 1 },
    ])
    expect(buildCategoryChartData(transactions, filters, "netWorth")).toEqual([])
    expect(buildCategoryChartData(transactions, filters, "investments")).toEqual([])
  })
})
