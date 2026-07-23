import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { parseImportText } from "@/features/imports/parser"

const localExportPath = process.env.BUDGETLENS_REAL_EXPORT_PATH
const localTransactionExportPath = process.env.BUDGETLENS_REAL_TRANSACTION_EXPORT_PATH

describe("private local export compatibility", () => {
  it("accepts a real net-worth export without exposing its contents", async ({ skip }) => {
    if (!localExportPath) {
      return skip()
    }

    const parsed = await parseImportText(
      await readFile(localExportPath, "utf8"),
      "private-local-export.csv",
    )

    expect(parsed.kind).toBe("netWorth")
    expect(parsed.issues).toEqual([])
    expect(parsed.wealth).toHaveLength(parsed.rowCount)
    expect(parsed.wealth.length).toBeGreaterThan(0)
    return undefined
  })
})

describe("private local transaction export compatibility", () => {
  it("accepts a real transaction export without exposing its contents", async ({ skip }) => {
    if (!localTransactionExportPath) {
      return skip()
    }

    const parsed = await parseImportText(
      await readFile(localTransactionExportPath, "utf8"),
      "private-local-transactions.csv",
    )

    expect(parsed.kind).toBe("transactions")
    expect(parsed.issues).toEqual([])
    expect(parsed.transactions).toHaveLength(parsed.rowCount)
    expect(parsed.transactions.length).toBeGreaterThan(0)
    return undefined
  })
})
