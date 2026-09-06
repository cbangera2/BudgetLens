import { describe, expect, it } from "vitest"

import {
  AVERAGE_MONTH_DAYS,
  fitDailyPaceMinor,
  projectNetWorthGoal,
} from "@/features/goals/projections"

const TARGET = { targetAmountMinor: 20_000_00, targetDate: "2027-02-28" }

describe("fitDailyPaceMinor", () => {
  it("returns the exact slope for perfectly linear history", () => {
    const pace = fitDailyPaceMinor([
      { date: "2026-01-01", valueMinor: 10_000_00 },
      { date: "2026-01-31", valueMinor: 13_000_00 },
    ])
    expect(pace).toBe(100_00)
  })

  it("fits the least-squares slope through uneven observations", () => {
    const pace = fitDailyPaceMinor([
      { date: "2026-01-01", valueMinor: 0 },
      { date: "2026-01-02", valueMinor: 0 },
      { date: "2026-01-03", valueMinor: 300 },
    ])
    expect(pace).toBe(150)
  })

  it("returns null without at least two dated observations", () => {
    expect(fitDailyPaceMinor([])).toBeNull()
    expect(fitDailyPaceMinor([{ date: "2026-01-01", valueMinor: 500_00 }])).toBeNull()
    expect(
      fitDailyPaceMinor([
        { date: "2026-01-01", valueMinor: 100_00 },
        { date: "2026-01-01", valueMinor: 200_00 },
      ]),
    ).toBeNull()
  })
})

describe("projectNetWorthGoal", () => {
  it("reports on-track with an exact projected hit date for steady growth", () => {
    const projection = projectNetWorthGoal(
      [
        { date: "2026-01-01", valueMinor: 10_000_00 },
        { date: "2026-01-31", valueMinor: 13_000_00 },
      ],
      "2026-02-01",
      TARGET,
    )
    expect(projection.status).toBe("on-track")
    expect(projection.latest?.valueMinor).toBe(13_000_00)
    expect(projection.paceMinorPerDay).toBe(100_00)
    expect(projection.paceMinorPerMonth).toBeCloseTo(100_00 * AVERAGE_MONTH_DAYS, 6)
    // (20_000 - 13_000) / 100 per day = 70 days after 2026-01-31.
    expect(projection.projectedHitDate).toBe("2026-04-11")
    expect(projection.projectedMinorAtTarget).toBeCloseTo(13_000_00 + 100_00 * 393, 6)
    expect(projection.requiredMinorPerMonth).toBeGreaterThan(0)
  })

  it("reports a miss when the pace cannot reach the target in time", () => {
    const projection = projectNetWorthGoal(
      [
        { date: "2026-01-01", valueMinor: 10_000_00 },
        { date: "2026-05-01", valueMinor: 10_100_00 },
      ],
      "2026-05-02",
      { targetAmountMinor: 20_000_00, targetDate: "2026-08-01" },
    )
    expect(projection.status).toBe("off-track")
    expect(projection.projectedHitDate).not.toBeNull()
    expect(projection.projectedHitDate! > "2026-08-01").toBe(true)
  })

  it("reports off-track without a hit date when the pace is flat or falling", () => {
    const projection = projectNetWorthGoal(
      [
        { date: "2026-01-01", valueMinor: 12_000_00 },
        { date: "2026-02-01", valueMinor: 11_000_00 },
      ],
      "2026-02-02",
      TARGET,
    )
    expect(projection.status).toBe("off-track")
    expect(projection.projectedHitDate).toBeNull()
    expect(projection.paceMinorPerDay).toBeLessThan(0)
  })

  it("reports empty history without any pace", () => {
    const projection = projectNetWorthGoal([], "2026-02-01", TARGET)
    expect(projection).toEqual({
      status: "empty",
      latest: null,
      paceMinorPerDay: null,
      paceMinorPerMonth: null,
      projectedMinorAtTarget: null,
      projectedHitDate: null,
      requiredMinorPerMonth: null,
    })
  })

  it("reports a single point with the required pace but no projection", () => {
    const projection = projectNetWorthGoal(
      [{ date: "2026-01-01", valueMinor: 10_000_00 }],
      "2026-02-01",
      TARGET,
    )
    expect(projection.status).toBe("single-point")
    expect(projection.latest?.valueMinor).toBe(10_000_00)
    expect(projection.paceMinorPerDay).toBeNull()
    expect(projection.projectedHitDate).toBeNull()
    expect(projection.requiredMinorPerMonth).toBeCloseTo(
      (20_000_00 - 10_000_00) / (392 / AVERAGE_MONTH_DAYS),
      6,
    )
  })

  it("reports a past target date without a required pace", () => {
    const projection = projectNetWorthGoal(
      [
        { date: "2026-01-01", valueMinor: 10_000_00 },
        { date: "2026-01-31", valueMinor: 13_000_00 },
      ],
      "2026-06-01",
      { targetAmountMinor: 20_000_00, targetDate: "2026-05-01" },
    )
    expect(projection.status).toBe("past-target")
    expect(projection.requiredMinorPerMonth).toBeNull()
    expect(projection.paceMinorPerDay).toBe(100_00)
  })

  it("reports achieved once the latest observation covers the target", () => {
    const projection = projectNetWorthGoal(
      [
        { date: "2026-01-01", valueMinor: 10_000_00 },
        { date: "2026-02-01", valueMinor: 21_000_00 },
      ],
      "2026-02-02",
      TARGET,
    )
    expect(projection.status).toBe("achieved")
    expect(projection.projectedHitDate).toBeNull()
    expect(projection.requiredMinorPerMonth).toBe(0)
  })
})
