import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  normalizeCsvHeader,
  suggestCsvMapping,
  validateCsvMapping,
} from "@/features/imports/csv-mapping"
import { parseImportTextWithMapping, readCsvHeaders } from "@/features/imports/parser"

async function fixture(name: string): Promise<string> {
  return readFile(path.resolve(process.cwd(), "tests/fixtures", name), "utf8")
}

describe("csv column aliases", () => {
  it("matches case-insensitive and whitespace variants", () => {
    expect(
      suggestCsvMapping(["  TRANSACTION DATE  ", "WITHDRAWAL", "  merchant DETAILS "]),
    ).toEqual({
      date: "  TRANSACTION DATE  ",
      amount: "WITHDRAWAL",
      description: "  merchant DETAILS ",
      category: null,
      account: null,
      type: null,
    })
    expect(normalizeCsvHeader("  Transaction_Date ")).toBe("transaction date")
    expect(normalizeCsvHeader("POSTING-DATE")).toBe("posting date")
  })

  it("prefills best-guess matches for bank-style headers", () => {
    const mapping = suggestCsvMapping([
      "Posting Date",
      "Withdrawal",
      "Narrative",
      "Spending Category",
      "Acct",
      "Flow",
      "Reference ID",
    ])

    expect(mapping).toEqual({
      date: "Posting Date",
      amount: "Withdrawal",
      description: "Narrative",
      category: "Spending Category",
      account: "Acct",
      type: "Flow",
    })
  })

  it("assigns each file column at most once", () => {
    const mapping = suggestCsvMapping(["Type", "Transaction Type"])
    expect(mapping.type).toBe("Type")
    expect(mapping.description).toBeNull()
  })

  it("reports unmapped required fields and duplicate selections", () => {
    expect(
      validateCsvMapping({
        date: null,
        amount: "Withdrawal",
        description: null,
        category: null,
        account: null,
        type: null,
      }),
    ).toContain("Date")

    expect(
      validateCsvMapping({
        date: "Posted",
        amount: "Posted",
        description: "Memo",
        category: null,
        account: null,
        type: null,
      }),
    ).toContain("Each field needs its own column")

    expect(
      validateCsvMapping({
        date: "A",
        amount: "B",
        description: "C",
        category: null,
        account: null,
        type: null,
      }),
    ).toBeNull()
  })
})

describe("parseImportTextWithMapping", () => {
  it("remaps date, amount, and description from odd headers", async () => {
    const parsed = await parseImportTextWithMapping(
      await fixture("bank-odd-headers.csv"),
      "bank-odd-headers.csv",
      {
        date: "Transaction Date",
        amount: "Withdrawal",
        description: "Narrative",
        category: "Spending Category",
        account: "Acct",
        type: "Flow",
      },
    )

    expect(parsed.kind).toBe("transactions")
    expect(parsed.issues).toEqual([])
    expect(parsed.transactions).toHaveLength(2)
    expect(parsed.transactions[0]).toMatchObject({
      date: "2026-02-03",
      amountMinor: -1825,
      description: "Example Corner Shop, North",
      category: "Groceries",
      accountName: "Everyday Checking",
      transactionType: "debit",
    })
    expect(parsed.transactions[1]).toMatchObject({
      date: "2026-01-04",
      amountMinor: 250_000,
      description: "Fictional Employer Payroll",
    })
  })

  it("ignores extra columns and parses quoted edge values", async () => {
    const content = await fixture("bank-quoted-edge.csv")
    expect(readCsvHeaders(content)).toEqual(["POSTING DATE", "Withdrawal", "MERCHANT DETAILS"])

    const parsed = await parseImportTextWithMapping(content, "bank-quoted-edge.csv", {
      date: "POSTING DATE",
      amount: "Withdrawal",
      description: "MERCHANT DETAILS",
      category: null,
      account: null,
      type: null,
    })

    expect(parsed.transactions).toHaveLength(2)
    expect(parsed.transactions[0]).toMatchObject({
      date: "2026-03-01",
      amountMinor: -4250,
      description: 'Example, Quoted "Merchant"',
    })
    expect(parsed.transactions[1]).toMatchObject({
      date: "2026-03-02",
      amountMinor: 125_000,
    })
    expect(parsed.issues).toEqual([])
  })

  it("rejects missing required fields, unknown columns, and duplicate targets", async () => {
    const content = await fixture("bank-odd-headers.csv")
    await expect(
      parseImportTextWithMapping(content, "bank.csv", {
        date: null,
        amount: "Withdrawal",
        description: "Narrative",
        category: null,
        account: null,
        type: null,
      }),
    ).rejects.toThrow("required field")

    await expect(
      parseImportTextWithMapping(content, "bank.csv", {
        date: "Nope",
        amount: "Withdrawal",
        description: "Narrative",
        category: null,
        account: null,
        type: null,
      }),
    ).rejects.toThrow("not in this file")

    await expect(
      parseImportTextWithMapping(content, "bank.csv", {
        date: "Withdrawal",
        amount: "Withdrawal",
        description: "Narrative",
        category: null,
        account: null,
        type: null,
      }),
    ).rejects.toThrow("own column")
  })

  it("reports invalid mapped rows without echoing raw values", async () => {
    const parsed = await parseImportTextWithMapping(
      "When,How Much,What\nnot-a-date,10,Example Shop\n2026-01-01,not-money,Example Shop\n",
      "odd.csv",
      {
        date: "When",
        amount: "How Much",
        description: "What",
        category: null,
        account: null,
        type: null,
      },
    )

    expect(parsed.kind).toBe("transactions")
    expect(parsed.transactions).toHaveLength(0)
    expect(parsed.issues).toHaveLength(2)
    expect(parsed.issues.map((issue) => issue.message).join(" ")).not.toContain("not-money")
  })
})
