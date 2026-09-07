import { buildTransaction } from "@/test/factories"

import {
  applyRangeToSelection,
  areReceiptCountsEqual,
  clampPage,
  compareTransactionsByColumn,
  computeRunningBalances,
  formatRelativeDate,
  nextColumnSort,
  orderedRangeIds,
  shouldIgnoreRowClick,
  sortTransactionsByColumn,
  toggleIdInSelection,
  type TransactionColumnSortState,
} from "./transaction-list-utils"

const noon = (iso: string) => new Date(`${iso}T12:00:00.000Z`)

describe("transaction list sort headers", () => {
  const rows = [
    buildTransaction({
      id: "b",
      date: "2026-02-01",
      description: "Beta Market",
      amountMinor: -2000,
      transactionType: null,
    }),
    buildTransaction({
      id: "a",
      date: "2026-01-01",
      description: "Alpha Market",
      amountMinor: 5000,
      transactionType: null,
    }),
    buildTransaction({
      id: "c",
      date: "2026-03-01",
      description: "Gamma Market",
      amountMinor: -100,
      transactionType: null,
    }),
  ]

  it("cycles none -> asc -> desc -> none per column", () => {
    let state: TransactionColumnSortState = null
    state = nextColumnSort(state, "date")
    expect(state).toEqual({ key: "date", direction: "asc" })
    state = nextColumnSort(state, "date")
    expect(state).toEqual({ key: "date", direction: "desc" })
    state = nextColumnSort(state, "date")
    expect(state).toBeNull()
    expect(nextColumnSort({ key: "date", direction: "desc" }, "amount")).toEqual({
      key: "amount",
      direction: "asc",
    })
  })

  it("sorts dates chronologically with stable id tie-breaks", () => {
    expect(
      sortTransactionsByColumn(rows, { key: "date", direction: "asc" }).map((row) => row.id),
    ).toEqual(["a", "b", "c"])
    expect(
      sortTransactionsByColumn(rows, { key: "date", direction: "desc" }).map((row) => row.id),
    ).toEqual(["c", "b", "a"])
    expect(sortTransactionsByColumn(rows, null).map((row) => row.id)).toEqual(["b", "a", "c"])
  })

  it("sorts normalized amounts and merchants in both directions", () => {
    expect(
      sortTransactionsByColumn(rows, { key: "amount", direction: "asc" }).map((row) => row.id),
    ).toEqual(["b", "c", "a"])
    expect(
      sortTransactionsByColumn(rows, { key: "amount", direction: "desc" }).map((row) => row.id),
    ).toEqual(["a", "c", "b"])
    expect(
      sortTransactionsByColumn(rows, { key: "merchant", direction: "asc" }).map((row) => row.id),
    ).toEqual(["a", "b", "c"])
    expect(
      sortTransactionsByColumn(rows, { key: "merchant", direction: "desc" }).map((row) => row.id),
    ).toEqual(["c", "b", "a"])
  })

  it("sorts null-ish values last in both directions without throwing", () => {
    const withNulls = [
      buildTransaction({
        id: "valid",
        date: "2026-01-05",
        description: "Valid Market",
        amountMinor: -100,
      }),
      buildTransaction({
        id: "blank-date",
        date: "",
        description: "Blank Date",
        amountMinor: -200,
      }),
      buildTransaction({
        id: "blank-merchant",
        date: "2026-01-06",
        description: "",
        amountMinor: -300,
      }),
    ]
    expect(
      sortTransactionsByColumn(withNulls, { key: "date", direction: "asc" }).map((row) => row.id),
    ).toEqual(["valid", "blank-merchant", "blank-date"])
    expect(
      sortTransactionsByColumn(withNulls, { key: "date", direction: "desc" }).map((row) => row.id),
    ).toEqual(["blank-merchant", "valid", "blank-date"])
    expect(
      sortTransactionsByColumn(withNulls, { key: "merchant", direction: "asc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["blank-date", "valid", "blank-merchant"])
    expect(
      sortTransactionsByColumn(withNulls, { key: "merchant", direction: "desc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["valid", "blank-date", "blank-merchant"])
    expect(compareTransactionsByColumn(withNulls[0]!, withNulls[0]!, "date", "asc")).toBe(0)
  })

  it("handles non-finite amounts as nulls last", () => {
    const left = buildTransaction({ id: "left", amountMinor: Number.NaN })
    const right = buildTransaction({ id: "right", amountMinor: -100 })
    expect(compareTransactionsByColumn(left, right, "amount", "asc")).toBe(1)
    expect(compareTransactionsByColumn(right, left, "amount", "desc")).toBe(-1)
  })
})

describe("transaction relative dates", () => {
  it("formats today, yesterday, tomorrow, and day offsets", () => {
    expect(formatRelativeDate("2026-04-10", noon("2026-04-10"))).toBe("today")
    expect(formatRelativeDate("2026-04-09", noon("2026-04-10"))).toBe("yesterday")
    expect(formatRelativeDate("2026-04-11", noon("2026-04-10"))).toBe("tomorrow")
    expect(formatRelativeDate("2026-04-07", noon("2026-04-10"))).toBe("3 days ago")
    expect(formatRelativeDate("2026-04-13", noon("2026-04-10"))).toBe("in 3 days")
  })

  it("falls back to months and years and rejects invalid input", () => {
    expect(formatRelativeDate("2026-02-10", noon("2026-04-10"))).toBe("2 months ago")
    expect(formatRelativeDate("2025-04-10", noon("2026-04-10"))).toBe("1 year ago")
    expect(formatRelativeDate("not-a-date", noon("2026-04-10"))).toBe("")
    expect(formatRelativeDate("2026-02-30", noon("2026-04-10"))).toBe("")
  })
})

describe("transaction running balances", () => {
  it("accumulates per-account totals in chronological order", () => {
    const rows = [
      buildTransaction({
        id: "t2",
        date: "2026-01-02",
        accountName: "Checking",
        amountMinor: -2000,
        transactionType: null,
      }),
      buildTransaction({
        id: "t1",
        date: "2026-01-01",
        accountName: "Checking",
        amountMinor: 10_000,
        transactionType: null,
      }),
      buildTransaction({
        id: "s1",
        date: "2026-01-01",
        accountName: "Savings",
        amountMinor: 5000,
        transactionType: null,
      }),
      buildTransaction({
        id: "t3",
        date: "2026-01-03",
        accountName: "Checking",
        amountMinor: -3000,
        transactionType: null,
      }),
    ]
    const balances = computeRunningBalances(rows)
    expect(balances.get("t1")).toBe(10_000)
    expect(balances.get("t2")).toBe(8000)
    expect(balances.get("t3")).toBe(5000)
    expect(balances.get("s1")).toBe(5000)
  })

  it("normalizes signed amounts and groups missing accounts together", () => {
    const rows = [
      buildTransaction({
        id: "credit",
        date: "2026-01-01",
        accountName: null,
        accountType: null,
        amountMinor: 2500,
        transactionType: "Credit",
      }),
      buildTransaction({
        id: "debit",
        date: "2026-01-02",
        accountName: null,
        accountType: null,
        amountMinor: 1000,
        transactionType: "Debit",
      }),
    ]
    const balances = computeRunningBalances(rows)
    expect(balances.get("credit")).toBe(2500)
    expect(balances.get("debit")).toBe(1500)
  })
})

describe("transaction receipt counts", () => {
  it("compares per-transaction counts by value", () => {
    expect(areReceiptCountsEqual(new Map(), new Map())).toBe(true)
    expect(areReceiptCountsEqual(new Map([["a", 1]]), new Map([["a", 1]]))).toBe(true)
    expect(
      areReceiptCountsEqual(
        new Map([["a", 1]]),
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      ),
    ).toBe(false)
    expect(areReceiptCountsEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false)
    expect(areReceiptCountsEqual(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false)
  })
})

describe("transaction pagination", () => {
  it("clamps the current page into the shrunken result set", () => {
    expect(clampPage(2, 1)).toBe(1)
    expect(clampPage(1, 1)).toBe(1)
    expect(clampPage(3, 5)).toBe(3)
    expect(clampPage(0, 4)).toBe(1)
    expect(clampPage(-2, 4)).toBe(1)
  })
})

describe("transaction row clicks", () => {
  it("ignores clicks from interactive descendants including SVG icons", () => {
    const row = document.createElement("tr")
    const cell = document.createElement("td")
    const button = document.createElement("button")
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    svg.append(path)
    button.append(svg)
    cell.append(button, document.createTextNode("2026-01-04"))
    row.append(cell)
    expect(shouldIgnoreRowClick(button)).toBe(true)
    expect(shouldIgnoreRowClick(svg)).toBe(true)
    expect(shouldIgnoreRowClick(path)).toBe(true)
    expect(shouldIgnoreRowClick(cell)).toBe(false)
    expect(shouldIgnoreRowClick(row)).toBe(false)
    expect(shouldIgnoreRowClick(null)).toBe(false)
    expect(shouldIgnoreRowClick(undefined)).toBe(false)
  })
})

describe("transaction bulk selection", () => {
  it("toggles single ids without mutating the input", () => {
    const selected = new Set(["a"])
    expect([...toggleIdInSelection(selected, "b", true)]).toEqual(["a", "b"])
    expect([...toggleIdInSelection(selected, "a", false)]).toEqual([])
    expect([...selected]).toEqual(["a"])
  })

  it("expands shift ranges in either direction with anchor fallback", () => {
    const order = ["a", "b", "c", "d"]
    expect(orderedRangeIds(order, "b", "d")).toEqual(["b", "c", "d"])
    expect(orderedRangeIds(order, "d", "b")).toEqual(["b", "c", "d"])
    expect(orderedRangeIds(order, null, "c")).toEqual(["c"])
    expect(orderedRangeIds(order, "missing", "c")).toEqual(["c"])
  })

  it("applies range checks and unchecks", () => {
    expect([...applyRangeToSelection(new Set(["a"]), ["a", "b", "c"], "a", "c", true)]).toEqual([
      "a",
      "b",
      "c",
    ])
    expect([
      ...applyRangeToSelection(new Set(["a", "b", "c"]), ["a", "b", "c"], "b", "c", false),
    ]).toEqual(["a"])
  })
})
