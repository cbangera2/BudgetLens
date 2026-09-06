import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BudgetLensDatabase } from "@/db/database"
import { ensureDemoData } from "@/features/demo/demo-seed"
import { DEMO_SOURCE_NAME } from "@/features/demo/golden-bundle"
import {
  ONBOARDING_STORAGE_KEY,
  recordOnboardingChoice,
  type OnboardingChoice,
} from "@/features/onboarding/onboarding-storage"

describe("onboarding seed gate", () => {
  let db: BudgetLensDatabase

  beforeEach(() => {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY)
    db = new BudgetLensDatabase(`budgetlens-seed-gate-test-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await db.delete()
  })

  it("skips seeding when no onboarding choice is recorded", async () => {
    const seeded = await ensureDemoData(db)

    expect(seeded).toBe(false)
    expect(await db.imports.count()).toBe(0)
    expect(await db.transactions.count()).toBe(0)
  })

  it.each(["empty", "import"] as const)(
    "skips seeding when the choice is %s",
    async (choice: OnboardingChoice) => {
      recordOnboardingChoice(window.localStorage, choice)

      const seeded = await ensureDemoData(db)

      expect(seeded).toBe(false)
      expect(await db.imports.count()).toBe(0)
      expect(await db.transactions.count()).toBe(0)
      expect(await db.budgets.count()).toBe(0)
    },
  )

  it("seeds the sample budget when the choice is demo", async () => {
    recordOnboardingChoice(window.localStorage, "demo")

    const seeded = await ensureDemoData(db)

    expect(seeded).toBe(true)
    const batches = await db.imports.toArray()
    expect(batches).toHaveLength(1)
    expect(batches[0]?.sourceName).toBe(DEMO_SOURCE_NAME)
    expect(await db.transactions.count()).toBeGreaterThan(0)
  })
})
