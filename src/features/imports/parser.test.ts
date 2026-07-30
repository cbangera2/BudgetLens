import { readFile } from "node:fs/promises"
import path from "node:path"

import { parseImportContent, parseImportText } from "@/features/imports/parser"

async function fixture(name: string): Promise<string> {
  return readFile(path.resolve(process.cwd(), "tests/fixtures", name), "utf8")
}

describe("parseImportText", () => {
  it("parses current configurable transaction columns with RFC CSV quoting", async () => {
    const parsed = await parseImportText(
      `\uFEFF${(await fixture("current-transactions.csv")).replaceAll("\n", "\r\n")}`,
      "C:\\private\\transactions.csv",
    )

    expect(parsed.kind).toBe("transactions")
    expect(parsed.sourceName).toBe("transactions.csv")
    expect(parsed.rowCount).toBe(2)
    expect(parsed.issues).toEqual([])
    expect(parsed.transactions[0]).toMatchObject({
      date: "2026-01-03",
      description: "Example Market, North",
      amountMinor: -4250,
      labels: ["weekly", "essential"],
    })
    expect(parsed.transactions[1]).toMatchObject({
      date: "2026-01-04",
      description: 'Quoted "Merchant"',
      amountMinor: 125_000,
      notes: "Synthetic\r\nmultiline note",
    })
  })

  it("maps legacy Store/Vendor and Type aliases", async () => {
    const parsed = await parseImportText(
      await fixture("legacy-transactions.csv"),
      "legacy-transactions.csv",
    )

    expect(parsed.transactions[0]).toMatchObject({
      description: "Synthetic Hardware",
      transactionType: "Debit",
      amountMinor: -1999,
    })
  })

  it.each([
    ["net-worth.csv", "netWorth", 1_234_567],
    ["investments.csv", "investment", 650_025],
  ] as const)("classifies %s", async (name, kind, firstValue) => {
    const parsed = await parseImportText(await fixture(name), name)

    expect(parsed.kind).toBe(kind)
    expect(parsed.wealth[0]?.valueMinor).toBe(firstValue)
    expect(parsed.issues).toEqual([])
  })

  it("parses dated net worth breakdown snapshots", async () => {
    const parsed = await parseImportText(
      [
        "As Of,Section,Segment,Balance,Descriptor",
        '2026-07-29T12:00:00.000Z,assets,cash,1200.50,"2 accounts"',
        '2026-07-29T12:00:00.000Z,debts,creditCards,500.25,"3 accounts"',
      ].join("\n"),
      "net_worth_breakdown_2026-07-29.csv",
    )

    expect(parsed.kind).toBe("wealthBreakdown")
    expect(parsed.wealthBreakdown).toEqual([
      {
        date: "2026-07-29",
        section: "assets",
        segment: "cash",
        valueMinor: 120_050,
        descriptor: "2 accounts",
      },
      {
        date: "2026-07-29",
        section: "debts",
        segment: "creditCards",
        valueMinor: 50_025,
        descriptor: "3 accounts",
      },
    ])
    expect(parsed.issues).toEqual([])
  })

  it("parses dated detailed wealth account snapshots", async () => {
    const parsed = await parseImportText(
      [
        "As Of,Account Type,Source Label,Balance,Descriptor",
        '2026-07-29T12:00:00.000Z,investments,"Synthetic Brokerage",8000.00,Connected',
        '2026-07-29T12:00:00.000Z,property,"Example Property",10000.00,Manual',
      ].join("\n"),
      "wealth_accounts_2026-07-29.csv",
    )

    expect(parsed.kind).toBe("wealthAccounts")
    expect(parsed.wealthAccounts).toEqual([
      {
        date: "2026-07-29",
        accountType: "investments",
        sourceLabel: "Synthetic Brokerage",
        valueMinor: 800_000,
        descriptor: "Connected",
      },
      {
        date: "2026-07-29",
        accountType: "property",
        sourceLabel: "Example Property",
        valueMinor: 1_000_000,
        descriptor: "Manual",
      },
    ])
    expect(parsed.issues).toEqual([])
  })

  it("rejects mismatched net worth sections without echoing balances", async () => {
    const parsed = await parseImportText(
      "As Of,Section,Segment,Balance,Descriptor\n2026-07-29,assets,loans,1234.56,Example",
      "invalid-breakdown.csv",
    )

    expect(parsed.wealthBreakdown).toEqual([])
    expect(parsed.issues[0]?.message).toContain("loans must use the debts section")
    expect(parsed.issues[0]?.message).not.toContain("1234.56")
  })

  it("reports invalid rows without including their raw values", async () => {
    const parsed = await parseImportText(
      "Date,Amount\nnot-a-date,10\n2026-01-01,not-money\n",
      "invalid.csv",
    )

    expect(parsed.rowCount).toBe(2)
    expect(parsed.transactions).toHaveLength(0)
    expect(parsed.issues).toHaveLength(2)
    expect(parsed.issues.map((issue) => issue.message).join(" ")).not.toContain("not-money")
  })

  it("rejects unsupported, duplicate, oversized, and binary input", async () => {
    await expect(parseImportText(await fixture("malformed.csv"), "malformed.csv")).rejects.toThrow(
      "Unsupported headers",
    )
    await expect(
      parseImportText("Date,Date,Amount\n2026-01-01,2026-01-01,1", "dup.csv"),
    ).rejects.toThrow("duplicate headers")
    await expect(
      parseImportText("Date,Amount\n2026-01-01,1", "large.csv", {
        maxFileBytes: 2,
        maxFiles: 1,
        maxRows: 10,
        maxTotalBytes: 2,
      }),
    ).rejects.toThrow("byte limit")
    await expect(parseImportText("Date,Amount\n2026-01-01,\0", "binary.csv")).rejects.toThrow(
      "Binary files",
    )
  })

  it("enforces the configured data-row limit", async () => {
    await expect(
      parseImportText("Date,Amount\n2026-01-01,1\n2026-01-02,2", "rows.csv", {
        maxFileBytes: 1000,
        maxFiles: 1,
        maxRows: 1,
        maxTotalBytes: 1000,
      }),
    ).rejects.toThrow("row limit")
  })

  it("parses Credit Karma transaction JSON without losing expense signs or account fields", async () => {
    const parsed = await parseImportContent(
      await fixture("transactions-page-one.json"),
      "C:\\private\\transactions-page-one.json",
    )

    expect(parsed).toMatchObject({
      kind: "transactions",
      sourceName: "transactions-page-one.json",
      rowCount: 2,
      issues: [],
    })
    expect(parsed.transactions[0]).toMatchObject({
      date: "2026-03-01",
      description: "Invented Corner Shop",
      amountMinor: -1875,
      transactionType: "debit",
      accountName: "Sample Checking",
      accountType: "CHECKING",
      provider: "Example Cooperative",
    })
    expect(parsed.transactions[1]).toMatchObject({
      description: "Fictional Employer",
      amountMinor: 250_000,
      transactionType: "credit",
    })
  })

  it("parses a versioned BudgetLens bundle with every supported data group", async () => {
    const parsed = await parseImportContent(
      await fixture("budgetlens-bundle.json"),
      "budgetlens_2026-07-01_to_2026-07-30.json",
    )

    expect(parsed).toMatchObject({
      kind: "bundle",
      rowCount: 5,
      issues: [],
    })
    expect(parsed.transactions[0]).toMatchObject({
      amountMinor: -1234,
      accountName: "Example Checking",
      provider: "Example Bank",
    })
    expect(parsed.wealth).toEqual([
      { series: "netWorth", date: "2026-07-01", valueMinor: 100_000 },
      { series: "investment", date: "2026-07-01", valueMinor: 50_000 },
    ])
    expect(parsed.wealthBreakdown[0]).toMatchObject({
      segment: "cash",
      valueMinor: 50_000,
    })
    expect(parsed.wealthAccounts[0]).toMatchObject({
      sourceLabel: "Example Checking",
      valueMinor: 50_000,
    })
  })

  it("rejects malformed JSON and unsupported JSON shapes without echoing values", async () => {
    await expect(parseImportContent('{"data":{"prime":', "malformed.json")).rejects.toThrow(
      "JSON parsing failed",
    )
    await expect(
      parseImportContent('{"secret":"do-not-echo"}', "unsupported.json"),
    ).rejects.toThrow("Unsupported JSON structure")
    await expect(
      parseImportContent('{"format":"budgetlens","version":2}', "future-bundle.json"),
    ).rejects.toThrow("unsupported BudgetLens bundle")
  })
})
