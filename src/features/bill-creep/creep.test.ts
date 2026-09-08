// Synthetic fixtures only: no real merchants, no real amounts.
import { describe, expect, it } from "vitest"

import { buildTransaction } from "@/test/factories"

import { detectBillCreep } from "./creep"

function expense(id: string, date: string, description: string, amountMinor: number) {
  return buildTransaction({ id, date, description, amountMinor, transactionType: "Debit" })
}

function monthly(idPrefix: string, description: string, amounts: number[], startMonth = 1) {
  return amounts.map((amountMinor, index) =>
    expense(
      `${idPrefix}-${index}`,
      `2026-${String(startMonth + index).padStart(2, "0")}-15`,
      description,
      amountMinor,
    ),
  )
}

describe("detectBillCreep", () => {
  it("flags an increase above the default threshold", () => {
    const transactions = monthly("up", "Acme Streaming", [-1000, -1000, -1000, -1200])
    const creeps = detectBillCreep(transactions)
    expect(creeps).toHaveLength(1)
    expect(creeps[0]).toMatchObject({
      key: "acme streaming",
      displayName: "Acme Streaming",
      baselineMinor: 1000,
      latestMinor: 1200,
      deltaMinor: 200,
      deltaPct: 20,
      firstSeenDate: "2026-01-15",
      latestDate: "2026-04-15",
      occurrences: 4,
    })
  })

  it("ignores a decrease", () => {
    const transactions = monthly("down", "Acme Streaming", [-1200, -1200, -1200, -1000])
    expect(detectBillCreep(transactions)).toEqual([])
  })

  it("ignores flat renewals", () => {
    const transactions = monthly("flat", "Example News", [-900, -900, -900, -900])
    expect(detectBillCreep(transactions)).toEqual([])
  })

  it("flags exactly +10% on the boundary", () => {
    const transactions = monthly("edge", "Boundary Power", [-5000, -5000, -5000, -5500])
    const creeps = detectBillCreep(transactions)
    expect(creeps).toHaveLength(1)
    expect(creeps[0]?.deltaPct).toBe(10)
  })

  it("stays silent just below +10%", () => {
    const transactions = monthly("near", "Nearly Power", [-5000, -5000, -5000, -5499])
    expect(detectBillCreep(transactions)).toEqual([])
  })

  it("applies the $2 floor to steep but tiny increases", () => {
    // +50% yet only +$1.50: noise, not creep.
    const transactions = monthly("tiny", "Tiny Meter", [-300, -300, -300, -450])
    expect(detectBillCreep(transactions)).toEqual([])
  })

  it("flags a $2.00 increase at the floor with enough percent", () => {
    const transactions = monthly("floor", "Floor Power", [-2000, -2000, -2000, -2200])
    const creeps = detectBillCreep(transactions)
    expect(creeps).toHaveLength(1)
    expect(creeps[0]).toMatchObject({ deltaMinor: 200, deltaPct: 10 })
  })

  it("uses the median of prior charges as the baseline", () => {
    // Prior median is 1000 despite one earlier spike; latest 1200 is +20%.
    const transactions = monthly("med", "Median Power", [-1000, -1000, -1500, -1200])
    const creeps = detectBillCreep(transactions)
    expect(creeps).toHaveLength(1)
    expect(creeps[0]?.baselineMinor).toBe(1000)
  })

  it("excludes first-time and one-time merchants", () => {
    expect(detectBillCreep([expense("once", "2026-01-15", "One-Time Shop", -5000)])).toEqual([])
    expect(
      detectBillCreep([
        expense("w1", "2026-01-15", "Twice Merchant", -1000),
        expense("w2", "2026-04-15", "Twice Merchant", -1500),
      ]),
    ).toEqual([])
  })

  it("excludes irregular merchants", () => {
    const transactions = [
      expense("i1", "2026-01-10", "Corner Deli", -2000),
      expense("i2", "2026-01-12", "Corner Deli", -2000),
      expense("i3", "2026-03-20", "Corner Deli", -2600),
      expense("i4", "2026-04-25", "Corner Deli", -2600),
    ]
    expect(detectBillCreep(transactions)).toEqual([])
  })

  it("respects a custom threshold", () => {
    const transactions = monthly("custom", "Custom Power", [-2000, -2000, -2000, -2300])
    expect(detectBillCreep(transactions, { thresholdPct: 20 })).toEqual([])
    expect(detectBillCreep(transactions, { thresholdPct: 15 })).toHaveLength(1)
  })

  it("skips dismissed merchants", () => {
    const transactions = monthly("dis", "Dismissed Power", [-1000, -1000, -1000, -1300])
    expect(detectBillCreep(transactions)).toHaveLength(1)
    expect(detectBillCreep(transactions, { dismissedKeys: new Set(["dismissed power"]) })).toEqual(
      [],
    )
  })

  it("sorts steepest increases first", () => {
    const transactions = [
      ...monthly("gentle", "Gentle Power", [-10000, -10000, -10000, -11000]),
      ...monthly("steep", "Steep Power", [-10000, -10000, -10000, -15000]),
    ]
    const creeps = detectBillCreep(transactions)
    expect(creeps.map((creep) => creep.key)).toEqual(["steep power", "gentle power"])
  })
})
