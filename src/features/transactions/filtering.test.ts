import { buildTransaction } from "@/test/factories"

import {
  defaultTransactionFilters,
  filterAndSortTransactions,
  parseTransactionFilters,
  serializeTransactionFilters,
} from "./filtering"

describe("transaction view filters", () => {
  const records = [
    buildTransaction({
      id: "1",
      date: "2026-02-01",
      description: "Coffee Shop",
      amountMinor: -500,
      category: "Dining",
      accountName: "Card",
      provider: "Bank A",
    }),
    buildTransaction({
      id: "2",
      date: "2026-01-01",
      description: "Payroll",
      amountMinor: 100_000,
      category: "Income",
      accountName: "Checking",
      provider: "Bank B",
      notes: "February pay",
      transactionType: "Credit",
    }),
  ]

  it("validates and bounds URL-backed filters", () => {
    expect(parseTransactionFilters("?q=pay&sort=amount-desc&type=Credit")).toMatchObject({
      search: "pay",
      sort: "amount-desc",
      transactionType: "Credit",
    })
    expect(parseTransactionFilters("?sort=not-valid").sort).toBe("date-desc")
    expect(serializeTransactionFilters(defaultTransactionFilters)).toBe("")
  })

  it("parses merchant, category, and account facets as combinable params", () => {
    expect(
      parseTransactionFilters("?merchant=Coffee%20Shop&category=Dining&account=Card"),
    ).toMatchObject({
      merchant: "Coffee Shop",
      merchants: ["Coffee Shop"],
      category: "Dining",
      categories: ["Dining"],
      account: "Card",
      accounts: ["Card"],
    })
    expect(parseTransactionFilters("?merchants=a%2Cb&excludedMerchants=c")).toMatchObject({
      merchants: ["a", "b"],
      excludedMerchants: ["c"],
    })
    const roundTripped = parseTransactionFilters(
      `?${serializeTransactionFilters({
        ...defaultTransactionFilters,
        merchant: "Coffee Shop",
        category: "Dining",
        account: "Card",
      })}`,
    )
    expect(roundTripped).toMatchObject({
      merchant: "Coffee Shop",
      category: "Dining",
      account: "Card",
    })
  })

  it("filters by exact merchant alongside category and account", () => {
    expect(
      filterAndSortTransactions(records, {
        ...defaultTransactionFilters,
        merchant: "Coffee Shop",
        category: "Dining",
        account: "Card",
      }).map(({ id }) => id),
    ).toEqual(["1"])
    expect(
      filterAndSortTransactions(records, {
        ...defaultTransactionFilters,
        merchants: ["Payroll"],
      }).map(({ id }) => id),
    ).toEqual(["2"])
    expect(
      filterAndSortTransactions(records, {
        ...defaultTransactionFilters,
        excludedMerchants: ["Coffee Shop"],
      }).map(({ id }) => id),
    ).toEqual(["2"])
  })

  it("searches across useful fields and combines exact filters", () => {
    expect(
      filterAndSortTransactions(records, {
        ...defaultTransactionFilters,
        search: "february",
        account: "Checking",
      }).map(({ id }) => id),
    ).toEqual(["2"])
    expect(
      filterAndSortTransactions(records, { ...defaultTransactionFilters, category: "Dining" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["1"])
  })

  it("sorts amounts without mutating repository results", () => {
    const result = filterAndSortTransactions(records, {
      ...defaultTransactionFilters,
      sort: "amount-asc",
    })
    expect(result.map(({ id }) => id)).toEqual(["1", "2"])
    expect(records.map(({ id }) => id)).toEqual(["1", "2"])
  })
})
