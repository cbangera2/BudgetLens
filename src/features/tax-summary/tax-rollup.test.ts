import { SPLIT_PARENT_LABEL } from "@/features/splits/splits"
import { buildTransaction } from "@/test/factories"

import {
  availableTaxYears,
  buildTaxSummary,
  buildTaxExportFilename,
  defaultTaxYear,
  describeTaxEmptyState,
  isCharitableCategory,
  resolveTaxRole,
  serializeTaxSummaryToCsv,
  unflagValue,
} from "./tax-rollup"

const FLAGS = { "Office Supplies": "deductible", Income: "taxable" } as const

function flags() {
  return { ...FLAGS }
}

describe("buildTaxSummary", () => {
  it("rolls up deductible totals by category, taxable income, and net", () => {
    const transactions = [
      buildTransaction({
        id: "t1",
        date: "2025-02-10",
        description: "Synthetic supply store",
        amountMinor: -20000,
        category: "Office Supplies",
        transactionType: "Debit",
      }),
      buildTransaction({
        id: "t2",
        date: "2025-03-12",
        description: "Synthetic paper order",
        amountMinor: -5000,
        category: "Office Supplies",
        transactionType: "Debit",
      }),
      buildTransaction({
        id: "t3",
        date: "2025-01-05",
        description: "Synthetic freelance payout",
        amountMinor: 250000,
        category: "Income",
        transactionType: "Credit",
      }),
    ]

    const summary = buildTaxSummary(2025, transactions, flags())

    expect(summary.deductibleByCategory).toEqual([
      { category: "Office Supplies", amountMinor: 25000 },
    ])
    expect(summary.deductibleTotalMinor).toBe(25000)
    expect(summary.taxableIncomeMinor).toBe(250000)
    expect(summary.netMinor).toBe(225000)
    expect(summary.transactionCount).toBe(3)
  })

  it("ignores unflagged categories and transactions from other years", () => {
    const transactions = [
      buildTransaction({
        id: "t1",
        date: "2025-06-01",
        description: "Synthetic bistro",
        amountMinor: -6425,
        category: "Dining",
        transactionType: "Debit",
      }),
      buildTransaction({
        id: "t2",
        date: "2024-12-15",
        description: "Synthetic prior-year supplies",
        amountMinor: -8800,
        category: "Office Supplies",
        transactionType: "Debit",
      }),
    ]

    const summary = buildTaxSummary(2025, transactions, flags())

    expect(summary.deductibleByCategory).toEqual([])
    expect(summary.taxableIncomeMinor).toBe(0)
    expect(summary.netMinor).toBe(0)
    expect(summary.transactionCount).toBe(0)
  })

  it("attributes split parts to their own row dates and excludes the superseded parent", () => {
    const transactions = [
      buildTransaction({
        id: "parent-1",
        date: "2024-12-31",
        description: "Synthetic year-end purchase",
        amountMinor: -10000,
        category: "Office Supplies",
        transactionType: "Debit",
        labels: [SPLIT_PARENT_LABEL],
      }),
      buildTransaction({
        id: "child-2024",
        date: "2024-12-31",
        description: "Synthetic year-end purchase — Office Supplies",
        amountMinor: -6000,
        category: "Office Supplies",
        transactionType: "Debit",
        labels: ["split:child:parent-1"],
      }),
      buildTransaction({
        id: "child-2025",
        date: "2025-01-05",
        description: "Synthetic year-end purchase — Office Supplies",
        amountMinor: -4000,
        category: "Office Supplies",
        transactionType: "Debit",
        labels: ["split:child:parent-1"],
      }),
    ]

    const rolled2024 = buildTaxSummary(2024, transactions, flags())
    const rolled2025 = buildTaxSummary(2025, transactions, flags())

    // The superseded parent never double-counts: each year sees only its parts.
    expect(rolled2024.deductibleTotalMinor).toBe(6000)
    expect(rolled2025.deductibleTotalMinor).toBe(4000)
  })

  it("normalizes absolute Credit Karma style amounts by transaction type", () => {
    const transactions = [
      buildTransaction({
        id: "t1",
        date: "2025-04-01",
        description: "Synthetic supply run",
        amountMinor: 7500,
        category: "Office Supplies",
        transactionType: "Debit",
      }),
      buildTransaction({
        id: "t2",
        date: "2025-04-02",
        description: "Synthetic client payment",
        amountMinor: 90000,
        category: "Income",
        transactionType: "Credit",
      }),
    ]

    const summary = buildTaxSummary(2025, transactions, flags())

    expect(summary.deductibleTotalMinor).toBe(7500)
    expect(summary.taxableIncomeMinor).toBe(90000)
  })
})

describe("charitable giving", () => {
  it("auto-matches charitable and donation category names", () => {
    expect(isCharitableCategory("Charitable Donations")).toBe(true)
    expect(isCharitableCategory("Donations")).toBe(true)
    expect(isCharitableCategory("Charity Gala")).toBe(true)
    expect(isCharitableCategory("Groceries")).toBe(false)
  })

  it("gives charitable giving its own line apart from deductible totals", () => {
    const transactions = [
      buildTransaction({
        id: "t1",
        date: "2025-05-01",
        description: "Synthetic food bank gift",
        amountMinor: -15000,
        category: "Charitable Donations",
        transactionType: "Debit",
      }),
      buildTransaction({
        id: "t2",
        date: "2025-02-10",
        description: "Synthetic supply store",
        amountMinor: -20000,
        category: "Office Supplies",
        transactionType: "Debit",
      }),
    ]

    const summary = buildTaxSummary(2025, transactions, flags())

    expect(summary.charitableCategories).toEqual(["Charitable Donations"])
    expect(summary.charitableMinor).toBe(15000)
    expect(summary.deductibleByCategory).toEqual([
      { category: "Office Supplies", amountMinor: 20000 },
    ])
    expect(summary.netMinor).toBe(-35000)
  })

  it("lets explicit flags override the charitable auto-match both ways", () => {
    expect(resolveTaxRole("Charitable Donations", { "Charitable Donations": "deductible" })).toBe(
      "deductible",
    )
    expect(resolveTaxRole("Charitable Donations", { "Charitable Donations": "none" })).toBeNull()
    expect(resolveTaxRole("Donations", { Donations: "taxable" })).toBe("taxable")
    expect(resolveTaxRole("Groceries", { Groceries: "charitable" })).toBe("charitable")

    const transactions = [
      buildTransaction({
        id: "t1",
        date: "2025-05-01",
        description: "Synthetic food bank gift",
        amountMinor: -15000,
        category: "Charitable Donations",
        transactionType: "Debit",
      }),
    ]
    const overridden = buildTaxSummary(2025, transactions, { "Charitable Donations": "deductible" })
    expect(overridden.charitableCategories).toEqual([])
    expect(overridden.deductibleTotalMinor).toBe(15000)

    const excluded = buildTaxSummary(2025, transactions, { "Charitable Donations": "none" })
    expect(excluded.charitableCategories).toEqual([])
    expect(excluded.transactionCount).toBe(0)
  })

  it("unflagging an auto-matched category persists an explicit exclusion", () => {
    expect(unflagValue("Charitable Donations")).toBe("none")
    expect(unflagValue("Office Supplies")).toBeNull()
  })
})

describe("tax years", () => {
  it("derives available years from transaction dates with no hardcoding", () => {
    const transactions = [
      buildTransaction({ id: "t1", date: "2025-01-05" }),
      buildTransaction({ id: "t2", date: "2023-06-01" }),
      buildTransaction({ id: "t3", date: "2025-11-20" }),
      buildTransaction({ id: "t4", date: "not-a-date" }),
    ]

    expect(availableTaxYears(transactions)).toEqual([2025, 2023])
    expect(availableTaxYears([])).toEqual([])
    expect(defaultTaxYear(transactions, 2030)).toBe(2025)
    expect(defaultTaxYear([], 2030)).toBe(2030)
  })
})

describe("describeTaxEmptyState", () => {
  it("guides to flagging categories, then to empty years", () => {
    const empty = buildTaxSummary(2025, [], {})
    expect(describeTaxEmptyState(empty, false)).toBe("no-flags")

    const flaggedButEmpty = buildTaxSummary(2025, [], flags())
    expect(describeTaxEmptyState(flaggedButEmpty, true)).toBe("empty-year")

    const filled = buildTaxSummary(
      2025,
      [
        buildTransaction({
          id: "t1",
          date: "2025-01-05",
          amountMinor: 10000,
          category: "Income",
          transactionType: "Credit",
        }),
      ],
      flags(),
    )
    expect(describeTaxEmptyState(filled, true)).toBeNull()
  })
})

describe("serializeTaxSummaryToCsv", () => {
  it("exports deductible rows, the charitable line, taxable income, and net", () => {
    const summary = buildTaxSummary(
      2025,
      [
        buildTransaction({
          id: "t1",
          date: "2025-02-10",
          description: "Synthetic supply store",
          amountMinor: -20000,
          category: "Office Supplies",
          transactionType: "Debit",
        }),
        buildTransaction({
          id: "t2",
          date: "2025-05-01",
          description: "Synthetic food bank gift",
          amountMinor: -15000,
          category: "Charitable Donations",
          transactionType: "Debit",
        }),
        buildTransaction({
          id: "t3",
          date: "2025-01-05",
          description: "Synthetic freelance payout",
          amountMinor: 250000,
          category: "Income",
          transactionType: "Credit",
        }),
      ],
      flags(),
    )

    const csv = serializeTaxSummaryToCsv(summary)
    const lines = csv.trim().split("\n")

    expect(lines[0]).toBe("Section,Category,Amount")
    expect(csv).toContain("Deductible,Office Supplies,200.00")
    expect(csv).toContain("Charitable giving,Charitable Donations,150.00")
    expect(csv).toContain("Taxable income,Income,2500.00")
    expect(csv).toContain("Net,Taxable income minus deductions,2150.00")
    expect(lines).toHaveLength(5)
    expect(buildTaxExportFilename(2025)).toBe("tax-summary-2025.csv")
  })

  it("omits the charitable line when no matching category exists", () => {
    const summary = buildTaxSummary(
      2025,
      [
        buildTransaction({
          id: "t1",
          date: "2025-01-05",
          amountMinor: 10000,
          category: "Income",
          transactionType: "Credit",
        }),
      ],
      flags(),
    )

    const csv = serializeTaxSummaryToCsv(summary)

    expect(csv).not.toContain("Charitable giving")
    expect(csv).toContain("Taxable income,Income,100.00")
  })
})
