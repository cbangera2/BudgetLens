import { describe, expect, it } from "vitest"

import { detectSubscriptions, type SubscriptionSummary } from "@/features/subscriptions/detect"
import { buildTransaction } from "@/test/factories"

import {
  addMonthsToKey,
  canNavigateNext,
  canNavigatePrev,
  clampMonthKey,
  countOverdue,
  earliestSubscriptionMonth,
  isMonthKey,
  monthDayCount,
  monthEndIso,
  monthStartIso,
  monthStartWeekday,
  monthTotalMinor,
  NAVIGATION_RANGE_MONTHS,
  OVERDUE_TOLERANCE_DAYS,
  projectMonthBills,
  resolveMonthBounds,
  toMonthKey,
} from "./calendar"

function subscription(overrides: Partial<SubscriptionSummary> = {}): SubscriptionSummary {
  return {
    key: "beacon streaming",
    displayName: "Beacon Streaming",
    occurrences: 4,
    medianIntervalDays: 30,
    medianAmountMinor: 1299,
    monthlyBurnMinor: 1318,
    lastDate: "2026-04-15",
    cadence: "monthly",
    ...overrides,
  }
}

function expense(id: string, date: string, description: string, amountMinor = -1299) {
  return buildTransaction({ id, date, description, amountMinor, transactionType: "Debit" })
}

describe("projectMonthBills", () => {
  it("projects the next monthly occurrence into the following month", () => {
    const occurrences = projectMonthBills([subscription()], "2026-05", "2026-05-01")

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({
      subscriptionKey: "beacon streaming",
      displayName: "Beacon Streaming",
      date: "2026-05-15",
      amountMinor: 1299,
      status: "upcoming",
    })
  })

  it("carries charges across month boundaries onto real calendar dates", () => {
    // Jan 31 plus a 30-day cadence skips February entirely and lands on Mar 2.
    const occurrences = projectMonthBills(
      [subscription({ key: "edge", displayName: "Edge", lastDate: "2026-01-31" })],
      "2026-03",
      "2026-03-01",
    )

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual(["2026-03-02"])
    const february = projectMonthBills(
      [subscription({ key: "edge", displayName: "Edge", lastDate: "2026-01-31" })],
      "2026-02",
      "2026-02-01",
    )
    expect(february).toHaveLength(0)
  })

  it("keeps stepping a stale schedule forward into far-future months", () => {
    const occurrences = projectMonthBills(
      [subscription({ lastDate: "2026-04-15" })],
      "2027-05",
      "2027-05-01",
    )

    expect(occurrences.length).toBeGreaterThan(0)
    for (const occurrence of occurrences) {
      expect(occurrence.date.startsWith("2027-05")).toBe(true)
    }
  })

  it("marks expected-but-unseen charges overdue only past the tolerance", () => {
    const sub = subscription({ lastDate: "2026-04-15" })
    // Expected date is 2026-05-15.
    expect(projectMonthBills([sub], "2026-05", "2026-05-15")[0]?.status).toBe("upcoming")
    expect(projectMonthBills([sub], "2026-05", "2026-05-16")[0]?.status).toBe("upcoming")
    // Exactly at the tolerance: still upcoming.
    expect(projectMonthBills([sub], "2026-05", "2026-05-18")[0]?.status).toBe("upcoming")
    // One day past the tolerance: overdue.
    expect(projectMonthBills([sub], "2026-05", "2026-05-19")[0]?.status).toBe("overdue")
    expect(projectMonthBills([sub], "2026-05", "2026-06-20")[0]?.status).toBe("overdue")
  })

  it("documents the overdue tolerance explicitly", () => {
    expect(OVERDUE_TOLERANCE_DAYS).toBe(3)
  })

  it("returns no bills for months before the first projected occurrence", () => {
    expect(projectMonthBills([subscription()], "2026-04", "2026-04-20")).toHaveLength(0)
    expect(projectMonthBills([subscription()], "2026-01", "2026-04-20")).toHaveLength(0)
  })

  it("returns no bills when nothing recurring was detected", () => {
    expect(projectMonthBills([], "2026-05", "2026-05-01")).toEqual([])
  })

  it("skips subscriptions with invalid dates or non-positive amounts", () => {
    const occurrences = projectMonthBills(
      [
        subscription({ key: "bad-date", lastDate: "2026-02-30" }),
        subscription({ key: "free", medianAmountMinor: 0 }),
      ],
      "2026-05",
      "2026-05-01",
    )
    expect(occurrences).toEqual([])
  })

  it("sorts same-day bills deterministically by merchant key", () => {
    const occurrences = projectMonthBills(
      [
        subscription({ key: "zeta", displayName: "Zeta", lastDate: "2026-04-15" }),
        subscription({ key: "alpha", displayName: "Alpha", lastDate: "2026-04-15" }),
      ],
      "2026-05",
      "2026-05-01",
    )
    expect(occurrences.map((occurrence) => occurrence.subscriptionKey)).toEqual(["alpha", "zeta"])
  })

  it("projects from reused detection output shapes", () => {
    const transactions = [
      expense("d1", "2026-01-15", "Beacon Streaming"),
      expense("d2", "2026-02-14", "Beacon Streaming"),
      expense("d3", "2026-03-16", "Beacon Streaming"),
      expense("d4", "2026-04-15", "Beacon Streaming"),
    ]
    const { subscriptions } = detectSubscriptions(transactions)
    expect(subscriptions).toHaveLength(1)

    const occurrences = projectMonthBills(subscriptions, "2026-05", "2026-05-01")
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({ date: "2026-05-15", amountMinor: 1299 })
  })
})

describe("month totals", () => {
  it("sums occurrences and counts overdue chips", () => {
    const occurrences = projectMonthBills(
      [
        subscription({ key: "a", displayName: "A", medianAmountMinor: 1299 }),
        subscription({
          key: "b",
          displayName: "B",
          medianAmountMinor: 750,
          lastDate: "2026-04-10",
          medianIntervalDays: 30,
        }),
      ],
      "2026-05",
      "2026-05-01",
    )
    expect(monthTotalMinor(occurrences)).toBe(2049)
    expect(countOverdue(occurrences)).toBe(0)
    expect(countOverdue(projectMonthBills([subscription()], "2026-05", "2026-06-20"))).toBe(1)
  })

  it("totals an empty month to zero", () => {
    expect(monthTotalMinor([])).toBe(0)
    expect(countOverdue([])).toBe(0)
  })
})

describe("navigation bounds", () => {
  it("centers the window on the current month by default", () => {
    const bounds = resolveMonthBounds("2026-09-07", null)
    expect(bounds).toEqual({ min: "2025-09", max: "2027-09" })
    expect(NAVIGATION_RANGE_MONTHS).toBe(12)
  })

  it("extends the lower bound to the earliest detected bill month", () => {
    const bounds = resolveMonthBounds("2026-09-07", "2026-04")
    expect(bounds.min).toBe("2025-09")
    const older = resolveMonthBounds("2026-09-07", "2024-02")
    expect(older).toEqual({ min: "2024-02", max: "2027-09" })
  })

  it("clamps navigation at both ends", () => {
    const bounds = resolveMonthBounds("2026-09-07", null)
    expect(clampMonthKey("2025-01", bounds)).toBe("2025-09")
    expect(clampMonthKey("2028-01", bounds)).toBe("2027-09")
    expect(clampMonthKey("2026-05", bounds)).toBe("2026-05")
    expect(canNavigatePrev("2025-09", bounds)).toBe(false)
    expect(canNavigateNext("2027-09", bounds)).toBe(false)
    expect(canNavigatePrev("2026-05", bounds)).toBe(true)
    expect(canNavigateNext("2026-05", bounds)).toBe(true)
  })

  it("steps months across year boundaries", () => {
    expect(addMonthsToKey("2026-12", 1)).toBe("2027-01")
    expect(addMonthsToKey("2027-01", -1)).toBe("2026-12")
    expect(addMonthsToKey("2026-05", -4)).toBe("2026-01")
  })

  it("derives the earliest bill month from detection output", () => {
    expect(
      earliestSubscriptionMonth([
        subscription({ lastDate: "2026-04-15" }),
        subscription({ key: "older", lastDate: "2026-02-10" }),
        subscription({ key: "bad", lastDate: "not-a-date" }),
      ]),
    ).toBe("2026-02")
    expect(earliestSubscriptionMonth([])).toBeNull()
  })
})

describe("month helpers", () => {
  it("validates month keys", () => {
    expect(isMonthKey("2026-05")).toBe(true)
    expect(isMonthKey("2026-13")).toBe(false)
    expect(isMonthKey("2026-5")).toBe(false)
    expect(isMonthKey("2026-05-15")).toBe(false)
  })

  it("resolves month starts, ends, and lengths across leap boundaries", () => {
    expect(monthStartIso("2026-02")).toBe("2026-02-01")
    expect(monthEndIso("2026-02")).toBe("2026-02-28")
    expect(monthEndIso("2024-02")).toBe("2024-02-29")
    expect(monthDayCount("2026-02")).toBe(28)
    expect(monthDayCount("2026-05")).toBe(31)
  })

  it("starts May 2026 on a Friday", () => {
    expect(monthStartWeekday("2026-05")).toBe(5)
  })

  it("derives month keys from ISO dates", () => {
    expect(toMonthKey("2026-05-15")).toBe("2026-05")
  })
})
