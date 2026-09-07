import { describe, expect, it } from "vitest"

import { buildTransaction } from "@/test/factories"

import { transferExcludedMerchantKeys } from "./transfer-exclusion"

function transferOut(id: string, date: string, amountMinor = -50_000) {
  return buildTransaction({
    id,
    date,
    description: "Transfer to High-Yield Savings",
    amountMinor,
    transactionType: "Debit",
    accountName: "Everyday Checking",
  })
}

function transferIn(id: string, date: string, amountMinor = 50_000) {
  return buildTransaction({
    id,
    date,
    description: "Transfer from Everyday Checking",
    amountMinor,
    transactionType: "Credit",
    accountName: "High-Yield Savings",
  })
}

function bill(id: string, date: string) {
  return buildTransaction({
    id,
    date,
    description: "Beacon Streaming",
    amountMinor: -1299,
    transactionType: "Debit",
    accountName: "Everyday Checking",
  })
}

describe("transferExcludedMerchantKeys", () => {
  it("excludes a merchant whose every expense row is transfer-paired", () => {
    const transactions = [
      transferOut("out-1", "2026-01-15"),
      transferIn("in-1", "2026-01-16"),
      transferOut("out-2", "2026-02-15"),
      transferIn("in-2", "2026-02-16"),
      transferOut("out-3", "2026-03-15"),
      transferIn("in-3", "2026-03-16"),
      bill("bill-1", "2026-01-15"),
      bill("bill-2", "2026-02-15"),
    ]
    // Real pair signal: ids must come from detection-shaped output, but the
    // exclusion unit only needs the id set contract.
    const paired = new Set(["out-1", "in-1", "out-2", "in-2", "out-3", "in-3"])

    expect(transferExcludedMerchantKeys(transactions, paired)).toEqual(
      new Set(["transfer to high yield savings"]),
    )
  })

  it("keeps a merchant with one unpaired expense row", () => {
    const transactions = [
      transferOut("out-1", "2026-01-15"),
      transferIn("in-1", "2026-01-16"),
      transferOut("out-2", "2026-02-15"),
      // No matching income for the February leg (one-sided import).
      transferOut("out-3", "2026-03-15"),
      transferIn("in-3", "2026-03-16"),
    ]
    const paired = new Set(["out-1", "in-1", "out-3", "in-3"])

    expect(transferExcludedMerchantKeys(transactions, paired)).toEqual(new Set())
  })

  it("ignores income rows and empty id sets", () => {
    const transactions = [transferIn("in-1", "2026-01-16"), bill("bill-1", "2026-01-15")]
    expect(transferExcludedMerchantKeys(transactions, new Set(["in-1"]))).toEqual(new Set())
    expect(transferExcludedMerchantKeys(transactions, new Set())).toEqual(new Set())
    expect(transferExcludedMerchantKeys([], new Set(["anything"]))).toEqual(new Set())
  })
})
