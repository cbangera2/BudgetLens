import { describe, expect, it } from "vitest"

import type { WealthSnapshot } from "@/domain/models"
import {
  buildChartPoints,
  daysSince,
  filterSnapshots,
  rangeStartDate,
  summarizeWealth,
} from "@/features/net-worth/calculations"

function snapshot(
  series: WealthSnapshot["series"],
  date: string,
  valueMinor: number,
  id = `${series}-${date}`,
): WealthSnapshot {
  return {
    id,
    series,
    date,
    valueMinor,
    importBatchId: "synthetic-batch",
    fingerprint: `synthetic-${id}`,
    createdAt: `${date}T12:00:00.000Z`,
  }
}

describe("wealth ranges", () => {
  it.each([
    ["1M", "2026-06-30"],
    ["3M", "2026-04-30"],
    ["6M", "2026-01-31"],
    ["YTD", "2026-01-01"],
    ["1Y", "2025-07-31"],
    ["All", undefined],
  ] as const)("calculates the inclusive %s boundary", (range, expected) => {
    expect(rangeStartDate(range, "2026-07-31")).toBe(expected)
  })

  it("uses calendar dates without local-time shifts and sorts observations", () => {
    const values = [
      snapshot("netWorth", "2026-07-31", 300),
      snapshot("netWorth", "2026-06-30", 200),
      snapshot("netWorth", "2026-06-29", 100),
      snapshot("netWorth", "2026-08-01", 400),
    ]
    expect(filterSnapshots(values, "1M", "2026-07-31").map(({ date }) => date)).toEqual([
      "2026-06-30",
      "2026-07-31",
    ])
  })
})

describe("wealth summaries", () => {
  it("calculates each series independently and uses integer minor units", () => {
    const result = summarizeWealth([
      snapshot("netWorth", "2026-01-01", 10_000_00),
      snapshot("investment", "2026-01-15", 2_000_00),
      snapshot("netWorth", "2026-02-01", 12_500_00),
      snapshot("investment", "2026-02-15", 3_000_00),
    ])
    expect(result.netWorth?.absoluteChangeMinor).toBe(2_500_00)
    expect(result.netWorth?.percentageChange).toBe(25)
    expect(result.investment?.absoluteChangeMinor).toBe(1_000_00)
    expect(result.investmentPercentage).toBe(24)
  })

  it("does not report changes for a one-point series", () => {
    const result = summarizeWealth([snapshot("netWorth", "2026-01-01", -10_00)])
    expect(result.netWorth?.absoluteChangeMinor).toBeNull()
    expect(result.netWorth?.percentageChange).toBeNull()
    expect(result.investment).toBeNull()
    expect(result.investmentPercentage).toBeNull()
  })

  it("reports an absolute change but no percentage from zero", () => {
    const result = summarizeWealth([
      snapshot("netWorth", "2026-01-01", 0),
      snapshot("netWorth", "2026-02-01", 500_00),
    ])
    expect(result.netWorth?.absoluteChangeMinor).toBe(500_00)
    expect(result.netWorth?.percentageChange).toBeNull()
  })

  it("does not calculate allocation against zero or negative net worth", () => {
    for (const netWorth of [0, -10_000_00]) {
      expect(
        summarizeWealth([
          snapshot("netWorth", "2026-01-01", netWorth),
          snapshot("investment", "2026-01-01", 2_000_00),
        ]).investmentPercentage,
      ).toBeNull()
    }
  })
})

describe("chart and freshness transforms", () => {
  it("aligns sparse series by ISO calendar date", () => {
    expect(
      buildChartPoints([
        snapshot("investment", "2026-02-01", 4_000_00),
        snapshot("netWorth", "2026-01-01", 10_000_00),
        snapshot("netWorth", "2026-02-01", 12_000_00),
      ]),
    ).toEqual([
      { date: "2026-01-01", netWorth: 10_000 },
      { date: "2026-02-01", investment: 4_000, netWorth: 12_000 },
    ])
  })

  it("calculates whole stale days without timezone dependence", () => {
    expect(daysSince("2026-06-01", "2026-07-22")).toBe(51)
    expect(daysSince("2026-07-23", "2026-07-22")).toBe(0)
  })
})
