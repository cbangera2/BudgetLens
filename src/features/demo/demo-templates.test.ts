import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"
import { isDemoDataOnly, seedDemoDataIfEmpty } from "@/features/demo/demo-seed"
import {
  DEFAULT_DEMO_TEMPLATE_ID,
  DEMO_TEMPLATES,
  DEMO_TEMPLATE_STORAGE_KEY,
  getDemoTemplate,
  isDemoSourceName,
  isDemoTemplateId,
  readDemoTemplateChoice,
  recordDemoTemplateChoice,
  type DemoTemplateId,
} from "@/features/demo/demo-templates"
import { DEMO_SOURCE_NAME } from "@/features/demo/golden-bundle"
import { clearAllData } from "@/features/settings/backup"

function memoryStorage(initial?: Record<string, string>): Pick<Storage, "getItem" | "setItem"> {
  const store = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

const EXPECTED: Record<
  DemoTemplateId,
  { merchant: string; budget: string; group: string; tripLabel: string }
> = {
  golden: {
    merchant: "Coastal Bike Rental",
    budget: "Travel",
    group: "Coastal Summer Trip",
    tripLabel: "trip",
  },
  student: {
    merchant: "Campus Brew Part-Time Pay",
    budget: "Subscriptions",
    group: "Spring Bus Trip",
    tripLabel: "bus-trip",
  },
  freelancer: {
    merchant: "Bluebird Design Invoice",
    budget: "Taxes",
    group: "Austin Client Onsite",
    tripLabel: "onsite",
  },
  family: {
    merchant: "Little Acorns Daycare",
    budget: "Childcare",
    group: "Family Lake House",
    tripLabel: "family-trip",
  },
}

describe("demo template registry", () => {
  it("lists persona templates with one-line descriptions, defaulting to golden", () => {
    expect(DEMO_TEMPLATES.map((template) => template.id)).toEqual([
      "golden",
      "student",
      "freelancer",
      "family",
    ])
    expect(DEFAULT_DEMO_TEMPLATE_ID).toBe("golden")
    for (const template of DEMO_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0)
      expect(template.tagline.length).toBeGreaterThan(0)
      expect(template.sourceName.length).toBeGreaterThan(0)
      expect(template.bundleJson.length).toBeGreaterThan(0)
      expect(template.budgets.length).toBeGreaterThan(0)
      expect(template.groups.length).toBeGreaterThan(0)
    }
    expect(getDemoTemplate("unknown").id).toBe("golden")
  })

  it("validates template ids", () => {
    expect(isDemoTemplateId("student")).toBe(true)
    expect(isDemoTemplateId("golden")).toBe(true)
    expect(isDemoTemplateId("tour")).toBe(false)
    expect(isDemoTemplateId(null)).toBe(false)
  })

  it("reads and records the template choice, defaulting to golden", () => {
    const storage = memoryStorage()
    expect(readDemoTemplateChoice(storage)).toBe("golden")
    recordDemoTemplateChoice(storage, "freelancer")
    expect(readDemoTemplateChoice(storage)).toBe("freelancer")
    expect(storage.getItem(DEMO_TEMPLATE_STORAGE_KEY)).toBe("freelancer")
  })

  it("falls back to golden for unknown or missing stored values", () => {
    expect(readDemoTemplateChoice(memoryStorage({ [DEMO_TEMPLATE_STORAGE_KEY]: "tour" }))).toBe(
      "golden",
    )
    expect(readDemoTemplateChoice(memoryStorage())).toBe("golden")
  })

  it("ignores invalid template records", () => {
    const storage = memoryStorage({ [DEMO_TEMPLATE_STORAGE_KEY]: "freelancer" })
    recordDemoTemplateChoice(storage, "tour")
    expect(readDemoTemplateChoice(storage)).toBe("freelancer")
  })

  it("recognizes every template source as demo data", () => {
    for (const template of DEMO_TEMPLATES) {
      expect(isDemoSourceName(template.sourceName)).toBe(true)
      expect(isDemoDataOnly([{ sourceName: template.sourceName }])).toBe(true)
    }
    expect(isDemoSourceName("real-export.json")).toBe(false)
    expect(isDemoSourceName(DEMO_SOURCE_NAME)).toBe(true)
    expect(
      isDemoDataOnly([
        { sourceName: DEMO_TEMPLATES[1]!.sourceName },
        { sourceName: DEMO_TEMPLATES[2]!.sourceName },
      ]),
    ).toBe(true)
    expect(
      isDemoDataOnly([
        { sourceName: DEMO_TEMPLATES[0]!.sourceName },
        { sourceName: "real-export.json" },
      ]),
    ).toBe(false)
  })
})

describe.each(DEMO_TEMPLATES.map((template) => template.id))(
  "template seeding (%s)",
  (templateId: DemoTemplateId) => {
    let db: BudgetLensDatabase

    beforeEach(() => {
      db = new BudgetLensDatabase(`budgetlens-template-test-${templateId}-${crypto.randomUUID()}`)
    })

    afterEach(async () => {
      await db.delete()
    })

    it("seeds valid rows passing existing validation", async () => {
      const expected = EXPECTED[templateId]
      const seeded = await seedDemoDataIfEmpty(db, templateId)

      expect(seeded).toBe(true)
      const transactions = await db.transactions.toArray()
      const budgets = await db.budgets.toArray()
      const groups = await db.transactionGroups.toArray()
      const batches = await db.imports.toArray()
      const breakdown = await db.wealthBreakdown.toArray()

      expect(transactions.length).toBeGreaterThan(20)
      expect(batches).toHaveLength(1)
      expect(batches[0]?.sourceName).toBe(getDemoTemplate(templateId).sourceName)
      expect(isDemoDataOnly(batches)).toBe(true)
      expect(transactions.map((row) => row.description)).toContain(expected.merchant)
      expect(budgets.map((budget) => budget.category)).toContain(expected.budget)
      expect(groups.map((group) => group.name)).toContain(expected.group)

      const tripGroup = groups.find((group) => group.name === expected.group)
      const shared = transactions.filter((transaction) => transaction.groupId === tripGroup?.id)
      expect(shared.length).toBeGreaterThan(0)
      for (const row of shared) {
        expect(row.shared).toBe(true)
        expect(row.shareCount).toBe(2)
        expect(row.labels).toContain(expected.tripLabel)
      }

      const history = await db.wealth.where("series").equals("netWorth").sortBy("date")
      const investments = await db.wealth.where("series").equals("investment").sortBy("date")
      expect(history.length).toBeGreaterThan(0)
      expect(investments.length).toBeGreaterThan(0)
      const latestNetWorth = history.at(-1)?.valueMinor ?? 0
      const latestInvestment = investments.at(-1)?.valueMinor ?? 0
      const assets = breakdown
        .filter((row) => row.section === "assets")
        .reduce((sum, row) => sum + row.valueMinor, 0)
      const debts = breakdown
        .filter((row) => row.section === "debts")
        .reduce((sum, row) => sum + row.valueMinor, 0)
      expect(latestNetWorth).toBe(assets - debts)
      expect(latestInvestment).toBeLessThanOrEqual(latestNetWorth)
    })
  },
)

describe("template seeding guards", () => {
  let db: BudgetLensDatabase

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-template-guard-test-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await db.delete()
  })

  it("defaults to the golden bundle when no template is specified", async () => {
    window.localStorage.removeItem(DEMO_TEMPLATE_STORAGE_KEY)
    const seeded = await seedDemoDataIfEmpty(db)

    expect(seeded).toBe(true)
    const batches = await db.imports.toArray()
    expect(batches[0]?.sourceName).toBe(DEMO_SOURCE_NAME)
  })

  it("blocks seeding over real user data", async () => {
    await db.budgets.add({
      id: crypto.randomUUID(),
      category: "Groceries",
      amountMinor: 10_000,
      period: "monthly",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    expect(await seedDemoDataIfEmpty(db, "student")).toBe(false)
    expect(await seedDemoDataIfEmpty(db, "freelancer")).toBe(false)
    expect(await db.imports.count()).toBe(0)
    expect(await db.transactions.count()).toBe(0)
  })

  it("blocks a second template while demo data is present", async () => {
    expect(await seedDemoDataIfEmpty(db, "golden")).toBe(true)
    expect(await seedDemoDataIfEmpty(db, "student")).toBe(false)
    expect(await db.imports.count()).toBe(1)
  })

  it("switching templates replaces cleanly after the existing reset path", async () => {
    expect(await seedDemoDataIfEmpty(db, "freelancer")).toBe(true)
    expect((await db.transactions.toArray()).map((row) => row.description)).toContain(
      "Bluebird Design Invoice",
    )

    await clearAllData(createRepositories(db))
    expect(await db.transactions.count()).toBe(0)
    expect(await db.imports.count()).toBe(0)

    expect(await seedDemoDataIfEmpty(db, "family")).toBe(true)
    const descriptions = (await db.transactions.toArray()).map((row) => row.description)
    expect(descriptions).toContain("Little Acorns Daycare")
    expect(descriptions).not.toContain("Bluebird Design Invoice")
    const batches = await db.imports.toArray()
    expect(batches).toHaveLength(1)
    expect(isDemoDataOnly(batches)).toBe(true)
  })

  it("every template is removable via the existing reset path", async () => {
    for (const template of DEMO_TEMPLATES) {
      const scoped = new BudgetLensDatabase(
        `budgetlens-template-reset-test-${template.id}-${crypto.randomUUID()}`,
      )
      try {
        // Sequential resets keep IndexedDB assertions deterministic per template.
        // oxlint-disable-next-line no-await-in-loop
        expect(await seedDemoDataIfEmpty(scoped, template.id)).toBe(true)
        // oxlint-disable-next-line no-await-in-loop
        expect(isDemoDataOnly(await scoped.imports.toArray())).toBe(true)
        // oxlint-disable-next-line no-await-in-loop
        await clearAllData(createRepositories(scoped))
        // oxlint-disable-next-line no-await-in-loop
        expect(await scoped.transactions.count()).toBe(0)
        // oxlint-disable-next-line no-await-in-loop
        expect(await scoped.imports.count()).toBe(0)
        // oxlint-disable-next-line no-await-in-loop
        expect(await scoped.budgets.count()).toBe(0)
        // oxlint-disable-next-line no-await-in-loop
        expect(await scoped.transactionGroups.count()).toBe(0)
      } finally {
        // oxlint-disable-next-line no-await-in-loop
        await scoped.delete()
      }
    }
  })
})
