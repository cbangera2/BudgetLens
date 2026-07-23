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

  it("rejects malformed JSON and unsupported JSON shapes without echoing values", async () => {
    await expect(parseImportContent('{"data":{"prime":', "malformed.json")).rejects.toThrow(
      "JSON parsing failed",
    )
    await expect(
      parseImportContent('{"secret":"do-not-echo"}', "unsupported.json"),
    ).rejects.toThrow("Unsupported JSON structure")
  })
})
