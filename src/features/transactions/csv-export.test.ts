import { parseImportText } from "@/features/imports/parser"
import { defaultTransactionFilters } from "@/features/transactions/filtering"

import {
  buildTransactionsExportFilename,
  sanitizeExportFilenameSegment,
  serializeTransactionsToCsv,
  TRANSACTION_EXPORT_HEADERS,
  type ExportableTransaction,
} from "./csv-export"

function row(overrides: Partial<ExportableTransaction> = {}): ExportableTransaction {
  return {
    date: "2026-09-15",
    description: "Synthetic Market",
    amountMinor: -4250,
    category: "Groceries",
    transactionType: "Debit",
    accountName: "Everyday Checking",
    accountType: "Checking",
    provider: "Sample Credit Union",
    labels: ["weekly", "essential"],
    notes: "Synthetic note",
    ...overrides,
  }
}

describe("serializeTransactionsToCsv", () => {
  it("emits the importer header vocabulary with an empty list header-only", () => {
    const csv = serializeTransactionsToCsv([])

    expect(csv.trim()).toBe(TRANSACTION_EXPORT_HEADERS.join(","))
  })

  it("exports amounts as human decimals with ISO dates", () => {
    const csv = serializeTransactionsToCsv([
      row({ date: "2026-09-01", description: "Synthetic Shop", amountMinor: -1999 }),
      row({ date: "2026-09-02", description: "Synthetic Refund", amountMinor: 250_000 }),
    ])
    const lines = csv.trim().split("\n")

    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("2026-09-01")
    expect(lines[1]).toContain("-19.99")
    expect(lines[2]).toContain("2026-09-02")
    expect(lines[2]).toContain("2500.00")
  })

  it("quotes commas, quotes, and newlines in descriptions", () => {
    const csv = serializeTransactionsToCsv([
      row({ description: "Example Market, North" }),
      row({ description: 'Quoted "Merchant"' }),
      row({ description: "Line one\nLine two", notes: "Synthetic\nmultiline note" }),
    ])

    expect(csv).toContain('"Example Market, North"')
    expect(csv).toContain('"Quoted ""Merchant"""')
    expect(csv).toContain('"Line one\nLine two"')
  })

  it("round-trips through the real parser cleanly", async () => {
    const input = [
      row({ description: "Example Market, North", notes: "A synthetic, quoted note" }),
      row({
        date: "2026-01-04",
        description: 'Quoted "Merchant"',
        amountMinor: 125_000,
        category: "Income",
        transactionType: "Credit",
        labels: ["income"],
        notes: "Synthetic\nmultiline note",
      }),
      row({ description: "Plain Shop", category: null, transactionType: null, labels: [] }),
    ]
    const csv = serializeTransactionsToCsv(input)
    const parsed = await parseImportText(csv, "transactions-export.csv")

    expect(parsed.kind).toBe("transactions")
    expect(parsed.issues).toEqual([])
    expect(parsed.rowCount).toBe(3)
    expect(parsed.transactions[0]).toMatchObject({
      date: "2026-09-15",
      description: "Example Market, North",
      amountMinor: -4250,
      category: "Groceries",
      accountName: "Everyday Checking",
      notes: "A synthetic, quoted note",
    })
    expect(parsed.transactions[0]?.labels).toEqual(["weekly", "essential"])
    expect(parsed.transactions[1]).toMatchObject({
      date: "2026-01-04",
      description: 'Quoted "Merchant"',
      amountMinor: 125_000,
      notes: "Synthetic\nmultiline note",
    })
    expect(parsed.transactions[2]).toMatchObject({
      description: "Plain Shop",
      category: null,
      amountMinor: -4250,
    })
  })
})

describe("buildTransactionsExportFilename", () => {
  it("includes the active category and month like transactions-groceries-2026-09.csv", () => {
    const filename = buildTransactionsExportFilename(
      { ...defaultTransactionFilters, categories: ["Groceries"], category: "Groceries" },
      new Date(2026, 8, 15),
    )

    expect(filename).toBe("transactions-groceries-2026-09.csv")
  })

  it("sanitizes unsafe filter text and date bounds", () => {
    const filename = buildTransactionsExportFilename(
      {
        ...defaultTransactionFilters,
        search: '  Big "Shop" ../..  ',
        from: "2026-09-01",
        to: "2026-09-30",
      },
      new Date(2026, 8, 15),
    )

    expect(filename).toBe("transactions-big-shop-2026-09-01-2026-09-30.csv")
    expect(filename).not.toContain("..")
    expect(filename).not.toContain(" ")
    expect(filename).not.toContain('"')
  })

  it("falls back to a safe month suffix with no active filters", () => {
    const filename = buildTransactionsExportFilename(
      { ...defaultTransactionFilters },
      new Date(2026, 0, 5),
    )

    expect(filename).toBe("transactions-2026-01.csv")
  })
})

describe("sanitizeExportFilenameSegment", () => {
  it.each([
    ["Groceries", "groceries"],
    ["  Everyday Checking! ", "everyday-checking"],
    ["../escape", "escape"],
    ["", ""],
    ["---", ""],
  ])("maps %s to %s", (input, expected) => {
    expect(sanitizeExportFilenameSegment(input)).toBe(expected)
  })
})
