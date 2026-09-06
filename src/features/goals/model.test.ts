import { describe, expect, it } from "vitest"

import {
  clearNetWorthGoal,
  isValidCalendarDate,
  loadNetWorthGoal,
  NET_WORTH_GOAL_STORAGE_KEY,
  parseGoalInput,
  saveNetWorthGoal,
  WEALTH_HISTORY_CHART_STORAGE_KEY,
} from "@/features/goals/model"

const GOAL = { targetAmountMinor: 20_000_00, targetDate: "2027-02-28" }

describe("parseGoalInput", () => {
  it("parses a dollar amount into integer minor units", () => {
    expect(parseGoalInput("20000", "2027-02-28")).toEqual(GOAL)
    expect(parseGoalInput("1234.56", "2027-02-28")?.targetAmountMinor).toBe(1234_56)
  })

  it("rejects non-positive amounts and invalid dates", () => {
    expect(parseGoalInput("0", "2027-02-28")).toBeNull()
    expect(parseGoalInput("-5", "2027-02-28")).toBeNull()
    expect(parseGoalInput("abc", "2027-02-28")).toBeNull()
    expect(parseGoalInput("20000", "")).toBeNull()
    expect(parseGoalInput("20000", "2027-02-30")).toBeNull()
    expect(parseGoalInput("20000", "not-a-date")).toBeNull()
  })

  it("rejects amounts that convert to zero or unsafe minor units", () => {
    expect(parseGoalInput("0.001", "2027-02-28")).toBeNull()
    expect(parseGoalInput("1e20", "2027-02-28")).toBeNull()
  })
})

describe("isValidCalendarDate", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(isValidCalendarDate("2027-02-28")).toBe(true)
    expect(isValidCalendarDate("2024-02-29")).toBe(true)
    expect(isValidCalendarDate("2027-02-29")).toBe(false)
    expect(isValidCalendarDate("2027-13-01")).toBe(false)
    expect(isValidCalendarDate("2027-1-1")).toBe(false)
  })
})

describe("goal storage", () => {
  it("round-trips one active goal through localStorage", () => {
    saveNetWorthGoal(window.localStorage, GOAL)
    expect(loadNetWorthGoal(window.localStorage)).toEqual(GOAL)
    const raw = window.localStorage.getItem(NET_WORTH_GOAL_STORAGE_KEY)
    expect(raw).toContain('"version":1')
    clearNetWorthGoal(window.localStorage)
    expect(loadNetWorthGoal(window.localStorage)).toBeNull()
  })

  it("ignores corrupt or foreign payloads", () => {
    window.localStorage.setItem(NET_WORTH_GOAL_STORAGE_KEY, "not json")
    expect(loadNetWorthGoal(window.localStorage)).toBeNull()
    window.localStorage.setItem(
      NET_WORTH_GOAL_STORAGE_KEY,
      JSON.stringify({ version: 1, targetAmountMinor: -5, targetDate: "2027-02-28" }),
    )
    expect(loadNetWorthGoal(window.localStorage)).toBeNull()
    window.localStorage.setItem(
      NET_WORTH_GOAL_STORAGE_KEY,
      JSON.stringify({ version: 999, targetAmountMinor: 100, targetDate: "2027-02-28" }),
    )
    expect(loadNetWorthGoal(window.localStorage)).toBeNull()
  })

  it("surfaces the target metric in stored wealth-chart settings on save", () => {
    window.localStorage.setItem(
      WEALTH_HISTORY_CHART_STORAGE_KEY,
      JSON.stringify({ kind: "area", metricKeys: ["netWorth", "investment"] }),
    )
    saveNetWorthGoal(window.localStorage, GOAL)
    expect(JSON.parse(window.localStorage.getItem(WEALTH_HISTORY_CHART_STORAGE_KEY)!)).toEqual({
      kind: "area",
      metricKeys: ["netWorth", "investment", "target"],
    })
    // Saving again never duplicates the key.
    saveNetWorthGoal(window.localStorage, GOAL)
    expect(JSON.parse(window.localStorage.getItem(WEALTH_HISTORY_CHART_STORAGE_KEY)!)).toEqual({
      kind: "area",
      metricKeys: ["netWorth", "investment", "target"],
    })
  })
})
