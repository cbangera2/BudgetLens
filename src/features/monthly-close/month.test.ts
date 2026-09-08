import { closingMonthFor, formatMonthLabel, isClosingMonth, monthRange } from "./month"

describe("closingMonthFor", () => {
  it("resolves the previous calendar month across a year boundary", () => {
    expect(closingMonthFor(new Date(2026, 0, 15))).toBe("2025-12")
    expect(closingMonthFor(new Date(2026, 8, 8))).toBe("2026-08")
  })

  it("matches isClosingMonth for the derived month only", () => {
    const now = new Date(2026, 8, 8)
    expect(isClosingMonth("2026-08", now)).toBe(true)
    expect(isClosingMonth("2026-09", now)).toBe(false)
    expect(isClosingMonth("not-a-month", now)).toBe(false)
  })

  it("rolls over: a new now yields a new closing month", () => {
    expect(closingMonthFor(new Date(2026, 8, 8))).toBe("2026-08")
    expect(closingMonthFor(new Date(2026, 9, 2))).toBe("2026-09")
  })

  it("builds an inclusive month range and a human label", () => {
    expect(monthRange("2026-08")).toEqual({ from: "2026-08-01", to: "2026-08-31" })
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(formatMonthLabel("2026-08")).toContain("2026")
  })
})
