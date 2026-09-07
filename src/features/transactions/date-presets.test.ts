import { getDatePresetRange, isIsoDate, matchDatePreset, toIsoDate } from "./date-presets"

describe("date presets", () => {
  it("computes the inclusive 30-day window", () => {
    expect(getDatePresetRange("last-30", new Date(2026, 8, 7))).toEqual({
      from: "2026-08-09",
      to: "2026-09-07",
    })
  })

  it("crosses month boundaries for trailing windows", () => {
    // 2026-03-01 minus 29 days lands in January.
    expect(getDatePresetRange("last-30", new Date(2026, 2, 1))).toEqual({
      from: "2026-01-31",
      to: "2026-03-01",
    })
    expect(getDatePresetRange("month", new Date(2026, 2, 1))).toEqual({
      from: "2026-03-01",
      to: "2026-03-01",
    })
  })

  it("crosses year boundaries for trailing windows and YTD", () => {
    expect(getDatePresetRange("last-30", new Date(2026, 0, 5))).toEqual({
      from: "2025-12-07",
      to: "2026-01-05",
    })
    expect(getDatePresetRange("ytd", new Date(2026, 0, 5))).toEqual({
      from: "2026-01-01",
      to: "2026-01-05",
    })
  })

  it("starts this month and YTD at the first day", () => {
    expect(getDatePresetRange("month", new Date(2026, 8, 7))).toEqual({
      from: "2026-09-01",
      to: "2026-09-07",
    })
    expect(getDatePresetRange("ytd", new Date(2026, 8, 7))).toEqual({
      from: "2026-01-01",
      to: "2026-09-07",
    })
  })

  it("clears bounds for the All preset", () => {
    expect(getDatePresetRange("all", new Date(2026, 8, 7))).toEqual({ from: "", to: "" })
  })

  it("round-trips each preset and rejects custom ranges", () => {
    const now = new Date(2026, 8, 7)
    for (const preset of ["last-30", "month", "ytd", "all"] as const) {
      const range = getDatePresetRange(preset, now)
      expect(matchDatePreset(range.from, range.to, now)).toBe(preset)
    }
    expect(matchDatePreset("2026-09-01", "", now)).toBeNull()
    expect(matchDatePreset("2026-08-01", "2026-08-31", now)).toBeNull()
  })

  it("validates ISO calendar dates, including leap days", () => {
    expect(isIsoDate("2026-09-07")).toBe(true)
    expect(isIsoDate("2024-02-29")).toBe(true)
    expect(isIsoDate("2026-02-30")).toBe(false)
    expect(isIsoDate("2026-13-01")).toBe(false)
    expect(isIsoDate("2026-9-7")).toBe(false)
    expect(isIsoDate("not-a-date")).toBe(false)
    expect(isIsoDate("")).toBe(false)
  })

  it("formats local dates without UTC shifting", () => {
    expect(toIsoDate(new Date(2026, 0, 1))).toBe("2026-01-01")
    expect(toIsoDate(new Date(2025, 11, 31))).toBe("2025-12-31")
  })
})
