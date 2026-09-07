import { beforeEach, describe, expect, it } from "vitest"

import {
  CASHFLOW_CUSHION_STORAGE_KEY,
  DEFAULT_CASHFLOW_CUSHION_MINOR,
  cushionMinorToDollarsInput,
  loadCashflowCushionMinor,
  parseCushionDollarsInput,
  parseCushionMinor,
  saveCashflowCushionMinor,
} from "./cushion"

beforeEach(() => {
  window.localStorage.clear()
})

describe("cashflow cushion store", () => {
  it("uses the default when nothing is stored", () => {
    expect(loadCashflowCushionMinor()).toBe(DEFAULT_CASHFLOW_CUSHION_MINOR)
  })

  it("round-trips a saved cushion under the versioned key", () => {
    saveCashflowCushionMinor(42_500)
    expect(window.localStorage.getItem(CASHFLOW_CUSHION_STORAGE_KEY)).toBe("42500")
    expect(loadCashflowCushionMinor()).toBe(42_500)
  })

  it("falls back to the default for corrupt or negative values", () => {
    window.localStorage.setItem(CASHFLOW_CUSHION_STORAGE_KEY, "not-a-number")
    expect(loadCashflowCushionMinor()).toBe(DEFAULT_CASHFLOW_CUSHION_MINOR)
    window.localStorage.setItem(CASHFLOW_CUSHION_STORAGE_KEY, "-5")
    expect(loadCashflowCushionMinor()).toBe(DEFAULT_CASHFLOW_CUSHION_MINOR)
  })

  it("ignores invalid saves", () => {
    saveCashflowCushionMinor(10_000)
    saveCashflowCushionMinor(Number.NaN)
    expect(loadCashflowCushionMinor()).toBe(10_000)
  })

  it("parses dollars input and formats it back", () => {
    expect(parseCushionDollarsInput("123.45")).toBe(12_345)
    expect(parseCushionDollarsInput("  ")).toBeNull()
    expect(parseCushionDollarsInput("-1")).toBeNull()
    expect(parseCushionDollarsInput("abc")).toBeNull()
    expect(parseCushionMinor(100)).toBe(100)
    expect(parseCushionMinor(-1)).toBeNull()
    expect(cushionMinorToDollarsInput(20_000)).toBe("200")
  })
})
