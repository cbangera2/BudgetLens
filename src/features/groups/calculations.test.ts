import { describe, expect, it } from "vitest"

import { buildTransaction, buildTransactionGroup } from "@/test/factories"

import {
  calculateGroupSummary,
  groupContributionMinor,
  groupFormValues,
  parseShareCount,
} from "./calculations"

describe("groupContributionMinor", () => {
  it("returns the raw normalized amount when not shared", () => {
    const expense = buildTransaction({ amountMinor: -4250 })
    expect(groupContributionMinor(expense)).toBe(-4250)
    const credit = buildTransaction({ amountMinor: 2500, transactionType: "Credit" })
    expect(groupContributionMinor(credit)).toBe(2500)
  })

  it("divides shared amounts and rounds to whole minor units", () => {
    const even = buildTransaction({ amountMinor: -5000, shared: true, shareCount: 2 })
    expect(groupContributionMinor(even)).toBe(-2500)
    const odd = buildTransaction({ amountMinor: -1001, shared: true, shareCount: 3 })
    expect(groupContributionMinor(odd)).toBe(-334)
  })

  it("treats non-positive or trivial share counts as unshared", () => {
    const weird = buildTransaction({ amountMinor: -5000, shared: true, shareCount: 1 })
    expect(groupContributionMinor(weird)).toBe(-5000)
  })
})

describe("calculateGroupSummary", () => {
  const group = buildTransactionGroup({ budgetMinor: 50_000 })

  it("summarizes gross, effective, saved-by-sharing, and refunds", () => {
    const members = [
      buildTransaction({ id: "1", description: "Hotel", amountMinor: -30_000 }),
      buildTransaction({
        id: "2",
        description: "Dinner",
        amountMinor: -10_000,
        category: "Dining",
        shared: true,
        shareCount: 2,
      }),
      buildTransaction({
        id: "3",
        description: "Refund",
        amountMinor: 5_000,
        category: "Travel",
        transactionType: "Credit",
      }),
    ]

    const summary = calculateGroupSummary(group, members)

    expect(summary.memberCount).toBe(3)
    expect(summary.sharedCount).toBe(1)
    expect(summary.grossExpenseMinor).toBe(40_000)
    expect(summary.effectiveExpenseMinor).toBe(35_000)
    expect(summary.savedBySharingMinor).toBe(5_000)
    expect(summary.refundMinor).toBe(5_000)
    expect(summary.netCostMinor).toBe(30_000)
    expect(summary.topExpenses.map((expense) => expense.id)).toEqual(["1", "2"])
  })

  it("breaks categories down by effective spend with shares", () => {
    const members = [
      buildTransaction({ id: "1", amountMinor: -30_000, category: "Lodging" }),
      buildTransaction({
        id: "2",
        amountMinor: -10_000,
        category: "Dining",
        shared: true,
        shareCount: 2,
      }),
    ]
    const summary = calculateGroupSummary(group, members)
    expect(summary.byCategory).toEqual([
      { category: "Lodging", amountMinor: 30_000, share: 30_000 / 35_000 },
      { category: "Dining", amountMinor: 5_000, share: 5_000 / 35_000 },
    ])
  })

  it("builds a cumulative daily series between member dates", () => {
    const members = [
      buildTransaction({ id: "1", date: "2026-06-02", amountMinor: -20_00 }),
      buildTransaction({ id: "2", date: "2026-06-01", amountMinor: -30_00 }),
      buildTransaction({
        id: "3",
        date: "2026-06-03",
        amountMinor: -10_00,
        shared: true,
        shareCount: 2,
      }),
    ]
    const summary = calculateGroupSummary(group, members)
    expect(summary.byDay).toEqual([
      { date: "2026-06-01", spendMinor: 3000, cumulativeMinor: 3000 },
      { date: "2026-06-02", spendMinor: 2000, cumulativeMinor: 5000 },
      { date: "2026-06-03", spendMinor: 500, cumulativeMinor: 5500 },
    ])
  })

  it("handles empty groups without dividing by zero", () => {
    const summary = calculateGroupSummary(group, [])
    expect(summary.byCategory).toEqual([])
    expect(summary.byDay).toEqual([])
    expect(summary.netCostMinor).toBe(0)
  })
})

describe("groupFormValues", () => {
  it("accepts a minimal valid form", () => {
    expect(
      groupFormValues({ name: " Japan ", budget: "", startDate: "", endDate: "", color: "blue" }),
    ).toEqual({
      name: "Japan",
      budgetMinor: null,
      startDate: null,
      endDate: null,
      color: "blue",
    })
  })

  it("parses budgets and validates ordering and shapes", () => {
    expect(
      groupFormValues({
        name: "Trip",
        budget: "2500.5",
        startDate: "2026-06-01",
        endDate: "2026-06-15",
        color: "rose",
      }),
    ).toMatchObject({ budgetMinor: 250_050, startDate: "2026-06-01" })

    expect(
      groupFormValues({ name: "", budget: "", startDate: "", endDate: "", color: "blue" }),
    ).toBeNull()
    expect(
      groupFormValues({ name: "Trip", budget: "-5", startDate: "", endDate: "", color: "blue" }),
    ).toBeNull()
    expect(
      groupFormValues({
        name: "Trip",
        budget: "",
        startDate: "2026-06-15",
        endDate: "2026-06-01",
        color: "blue",
      }),
    ).toBeNull()
    expect(
      groupFormValues({ name: "Trip", budget: "", startDate: "June", endDate: "", color: "blue" }),
    ).toBeNull()
  })
})

describe("parseShareCount", () => {
  it("accepts integers from 2 to 10 only", () => {
    expect(parseShareCount("2")).toBe(2)
    expect(parseShareCount("10")).toBe(10)
    expect(parseShareCount("1")).toBeNull()
    expect(parseShareCount("11")).toBeNull()
    expect(parseShareCount("2.5")).toBeNull()
    expect(parseShareCount("nope")).toBeNull()
  })
})
