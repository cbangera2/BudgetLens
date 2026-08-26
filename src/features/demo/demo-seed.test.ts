import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BudgetLensDatabase } from "@/db/database"
import { isDemoDataOnly, seedDemoDataIfEmpty } from "@/features/demo/demo-seed"
import { DEMO_SOURCE_NAME } from "@/features/demo/golden-bundle"

describe("demo data seeding", () => {
  let db: BudgetLensDatabase

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-demo-test-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await db.delete()
  })

  it("seeds a demo bundle and budgets into an empty database", async () => {
    const seeded = await seedDemoDataIfEmpty(db)

    expect(seeded).toBe(true)
    const transactions = await db.transactions.toArray()
    const wealth = await db.wealth.toArray()
    const breakdown = await db.wealthBreakdown.toArray()
    const accounts = await db.wealthAccounts.toArray()
    const budgets = await db.budgets.toArray()
    const batches = await db.imports.toArray()

    expect(transactions.length).toBeGreaterThan(100)
    expect(wealth.length).toBeGreaterThan(300)
    expect(breakdown.length).toBeGreaterThan(0)
    expect(accounts.length).toBeGreaterThan(0)
    expect(budgets.map((budget) => budget.category)).toContain("Groceries")
    expect(batches).toHaveLength(1)
    expect(batches[0]?.sourceName).toBe(DEMO_SOURCE_NAME)
  })

  it("produces internally consistent net worth numbers", async () => {
    await seedDemoDataIfEmpty(db)

    const history = await db.wealth.where("series").equals("netWorth").sortBy("date")
    const investments = await db.wealth.where("series").equals("investment").sortBy("date")
    const latestNetWorth = history.at(-1)?.valueMinor ?? 0
    const latestInvestment = investments.at(-1)?.valueMinor ?? 0
    const breakdown = await db.wealthBreakdown.toArray()

    const assets = breakdown
      .filter((row) => row.section === "assets")
      .reduce((sum, row) => sum + row.valueMinor, 0)
    const debts = breakdown
      .filter((row) => row.section === "debts")
      .reduce((sum, row) => sum + row.valueMinor, 0)

    expect(latestNetWorth).toBe(assets - debts)
    expect(latestInvestment).toBeLessThan(latestNetWorth)
    for (const point of [...history, ...investments]) {
      expect(point.valueMinor).toBeGreaterThan(0)
    }
  })

  it("does not seed when data already exists", async () => {
    await seedDemoDataIfEmpty(db)
    const seededAgain = await seedDemoDataIfEmpty(db)

    expect(seededAgain).toBe(false)
    expect(await db.imports.count()).toBe(1)
  })
})

describe("isDemoDataOnly", () => {
  it("returns false when undefined or empty", () => {
    expect(isDemoDataOnly(undefined)).toBe(false)
    expect(isDemoDataOnly([])).toBe(false)
  })

  it("returns true only when every batch came from the demo source", () => {
    expect(isDemoDataOnly([{ sourceName: DEMO_SOURCE_NAME }])).toBe(true)
    expect(
      isDemoDataOnly([{ sourceName: DEMO_SOURCE_NAME }, { sourceName: "real-export.json" }]),
    ).toBe(false)
  })
})
