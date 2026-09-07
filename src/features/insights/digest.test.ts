import { buildTransaction } from "@/test/factories"

import { buildInsightsDigest } from "./digest"

function expense(
  id: string,
  date: string,
  description: string,
  amountMinor: number,
  category: string | null = "Dining",
) {
  return buildTransaction({
    id,
    date,
    description,
    amountMinor,
    category,
    transactionType: "Debit",
  })
}

describe("insights digest", () => {
  it("computes month-over-month movers with amounts and percentages", () => {
    const digest = buildInsightsDigest([
      expense("prev-groceries", "2026-08-05", "Neighborhood Market", -10_000, "Groceries"),
      expense("prev-dining", "2026-08-06", "Corner Deli", -20_000, "Dining"),
      expense("curr-groceries", "2026-09-05", "Neighborhood Market", -15_000, "Groceries"),
      expense("curr-dining", "2026-09-06", "Corner Deli", -5_000, "Dining"),
    ])

    expect(digest.hasEnoughHistory).toBe(true)
    expect(digest.currentMonth).toBe("2026-09")
    expect(digest.previousMonth).toBe("2026-08")
    expect(digest.digestKey).toBe("2026-08>2026-09")
    expect(digest.moversUp).toEqual([
      {
        category: "Groceries",
        currentMinor: 15_000,
        previousMinor: 10_000,
        deltaMinor: 5_000,
        percent: 0.5,
        direction: "up",
      },
    ])
    expect(digest.moversDown).toEqual([
      {
        category: "Dining",
        currentMinor: 5_000,
        previousMinor: 20_000,
        deltaMinor: -15_000,
        percent: -0.75,
        direction: "down",
      },
    ])
  })

  it("reports a null percent when the prior month total is zero", () => {
    const digest = buildInsightsDigest([
      expense("prev-dining", "2026-08-06", "Corner Deli", -4_000, "Dining"),
      expense("curr-travel", "2026-09-07", "Skyline Air", -9_000, "Travel"),
      expense("curr-dining", "2026-09-06", "Corner Deli", -4_000, "Dining"),
    ])

    const travel = digest.moversUp.find((mover) => mover.category === "Travel")
    expect(travel).toMatchObject({
      currentMinor: 9_000,
      previousMinor: 0,
      deltaMinor: 9_000,
      percent: null,
      direction: "up",
    })
  })

  it("flags merchants first seen this month but not returning merchants", () => {
    const digest = buildInsightsDigest([
      expense("jul-deli", "2026-07-02", "Corner Deli", -5_000),
      expense("aug-other", "2026-08-03", "Harbor Books", -3_000),
      expense("sep-deli", "2026-09-04", "Corner Deli", -6_000),
      expense("sep-new", "2026-09-05", "Juniper Outfitters", -8_000),
    ])

    const names = digest.newMerchants.map((merchant) => merchant.displayName)
    expect(names).toContain("Juniper Outfitters")
    expect(names).not.toContain("Corner Deli")
    expect(names).not.toContain("Harbor Books")
    const juniper = digest.newMerchants.find(
      (merchant) => merchant.displayName === "Juniper Outfitters",
    )
    expect(juniper).toMatchObject({ totalMinor: 8_000, count: 1 })
  })

  it("flags prior-month merchants missing this month as dead via the fallback", () => {
    const digest = buildInsightsDigest([
      expense("aug-gym", "2026-08-02", "Iron Gym", -2_500),
      expense("aug-deli", "2026-08-03", "Corner Deli", -4_000),
      expense("sep-deli", "2026-09-03", "Corner Deli", -4_500),
    ])

    const names = digest.deadSubscriptions.map((dead) => dead.displayName)
    expect(names).toContain("Iron Gym")
    expect(names).not.toContain("Corner Deli")
    const gym = digest.deadSubscriptions.find((dead) => dead.displayName === "Iron Gym")
    expect(gym).toMatchObject({ lastDate: "2026-08-02", lastAmountMinor: 2_500 })
  })

  it("prefers recurring detection output for dead subscriptions when available", () => {
    const transactions = [
      expense("jun-stream", "2026-06-15", "Acme Streaming", -1_500, "Entertainment"),
      expense("jul-stream", "2026-07-15", "Acme Streaming", -1_500, "Entertainment"),
      expense("aug-stream", "2026-08-15", "Acme Streaming", -1_500, "Entertainment"),
      expense("jun-deli", "2026-06-02", "Corner Deli", -4_000),
      expense("jul-deli", "2026-07-02", "Corner Deli", -4_200),
      expense("aug-deli", "2026-08-02", "Corner Deli", -4_100),
      expense("sep-deli", "2026-09-02", "Corner Deli", -4_300),
    ]
    const digest = buildInsightsDigest(transactions)

    expect(digest.currentMonth).toBe("2026-09")
    const names = digest.deadSubscriptions.map((dead) => dead.displayName)
    expect(names).toContain("Acme Streaming")
    expect(names).not.toContain("Corner Deli")
  })

  it("reports thin history when fewer than two months exist", () => {
    const empty = buildInsightsDigest([])
    expect(empty.hasEnoughHistory).toBe(false)
    expect(empty.digestKey).toBeNull()
    expect(empty.insights).toEqual([])

    const single = buildInsightsDigest([expense("only", "2026-09-05", "Corner Deli", -4_000)])
    expect(single.hasEnoughHistory).toBe(false)
    expect(single.monthCount).toBe(1)
    expect(single.insights).toEqual([])
  })

  it("links every insight to a backing filtered view", () => {
    const digest = buildInsightsDigest([
      expense("aug-groceries", "2026-08-05", "Neighborhood Market", -10_000, "Groceries"),
      expense("aug-gym", "2026-08-02", "Iron Gym", -2_500),
      expense("sep-groceries", "2026-09-05", "Neighborhood Market", -16_000, "Groceries"),
      expense("sep-new", "2026-09-06", "Juniper Outfitters", -8_000),
    ])

    expect(digest.insights.length).toBeGreaterThan(0)
    const movers = digest.insights.filter(
      (insight) => insight.kind === "mover-up" || insight.kind === "mover-down",
    )
    const fresh = digest.insights.filter((insight) => insight.kind === "new-merchant")
    const ended = digest.insights.filter((insight) => insight.kind === "dead-subscription")
    expect(movers.length + fresh.length + ended.length).toBe(digest.insights.length)
    for (const insight of digest.insights) {
      expect(insight.id).toContain("2026-08>2026-09")
      expect(insight.link.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(insight.link.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    for (const insight of movers) {
      expect(insight.link.category).toBe(insight.title)
      expect(insight.link.from).toBe("2026-09-01")
    }
    for (const insight of fresh) {
      expect(insight.link.merchant).toBe(insight.title)
      expect(insight.link.from).toBe("2026-09-01")
    }
    for (const insight of ended) {
      expect(insight.link.merchant).toBe(insight.title)
      expect(insight.link.from).toBe("2026-08-01")
    }
    expect(movers.length).toBeGreaterThan(0)
    expect(fresh.length).toBeGreaterThan(0)
    expect(ended.length).toBeGreaterThan(0)
  })
})
