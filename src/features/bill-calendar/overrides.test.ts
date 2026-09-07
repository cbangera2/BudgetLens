import { describe, expect, it } from "vitest"

import {
  BILL_OVERRIDES_STORAGE_KEY,
  countDismissed,
  loadBillOverrides,
  overrideAmountDollars,
  parseOverrideAmountMinor,
  parseOverrideDayOfMonth,
  saveBillOverrides,
} from "./overrides"

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  } satisfies Storage
}

describe("bill overrides persistence", () => {
  it("round-trips overrides through storage", () => {
    const storage = memoryStorage()
    expect(loadBillOverrides(storage)).toEqual({})

    saveBillOverrides(
      {
        "beacon streaming": { amountMinor: 2000, dayOfMonth: 16 },
        "harbor news": { dismissed: true },
      },
      storage,
    )
    expect(loadBillOverrides(storage)).toEqual({
      "beacon streaming": { amountMinor: 2000, dayOfMonth: 16 },
      "harbor news": { dismissed: true },
    })
  })

  it("clears the key when the last override is removed", () => {
    const storage = memoryStorage()
    saveBillOverrides({ "beacon streaming": { amountMinor: 2000 } }, storage)
    expect(storage.getItem(BILL_OVERRIDES_STORAGE_KEY)).not.toBeNull()

    saveBillOverrides({}, storage)
    expect(storage.getItem(BILL_OVERRIDES_STORAGE_KEY)).toBeNull()
    expect(loadBillOverrides(storage)).toEqual({})
  })

  it("rejects corrupt, version-mismatched, and invalid payloads", () => {
    const storage = memoryStorage()
    storage.setItem(BILL_OVERRIDES_STORAGE_KEY, "not-json")
    expect(loadBillOverrides(storage)).toEqual({})

    storage.setItem(BILL_OVERRIDES_STORAGE_KEY, JSON.stringify({ version: 999, overrides: {} }))
    expect(loadBillOverrides(storage)).toEqual({})

    storage.setItem(
      BILL_OVERRIDES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        overrides: {
          "good merchant": { amountMinor: 2000 },
          "bad amount": { amountMinor: -5 },
          "bad day": { dayOfMonth: 32 },
          "empty entry": {},
          "not an object": 42,
        },
      }),
    )
    expect(loadBillOverrides(storage)).toEqual({ "good merchant": { amountMinor: 2000 } })
  })

  it("never throws when storage is blocked", () => {
    const broken: Storage = memoryStorage()
    broken.getItem = () => {
      throw new Error("blocked")
    }
    broken.setItem = () => {
      throw new Error("blocked")
    }
    expect(loadBillOverrides(broken)).toEqual({})
    expect(() => saveBillOverrides({ a: { dismissed: true } }, broken)).not.toThrow()
  })

  it("counts dismissed merchants", () => {
    expect(countDismissed({})).toBe(0)
    expect(
      countDismissed({
        a: { dismissed: true },
        b: { amountMinor: 100 },
      }),
    ).toBe(1)
  })
})

describe("override input parsing", () => {
  it("parses dollar amounts to minor units", () => {
    expect(parseOverrideAmountMinor("20")).toBe(2000)
    expect(parseOverrideAmountMinor("12.99")).toBe(1299)
    expect(parseOverrideAmountMinor(" 7.5 ")).toBe(750)
    expect(overrideAmountDollars(1299)).toBe("12.99")
  })

  it("rejects invalid amounts", () => {
    expect(parseOverrideAmountMinor("")).toBeNull()
    expect(parseOverrideAmountMinor("abc")).toBeNull()
    expect(parseOverrideAmountMinor("0")).toBeNull()
    expect(parseOverrideAmountMinor("-5")).toBeNull()
    expect(parseOverrideAmountMinor("12.999")).toBeNull()
    expect(parseOverrideAmountMinor("$12")).toBeNull()
    expect(parseOverrideAmountMinor("1,200")).toBeNull()
  })

  it("parses days of month", () => {
    expect(parseOverrideDayOfMonth("1")).toBe(1)
    expect(parseOverrideDayOfMonth("31")).toBe(31)
    expect(parseOverrideDayOfMonth(" 15 ")).toBe(15)
  })

  it("rejects invalid days", () => {
    expect(parseOverrideDayOfMonth("")).toBeNull()
    expect(parseOverrideDayOfMonth("0")).toBeNull()
    expect(parseOverrideDayOfMonth("32")).toBeNull()
    expect(parseOverrideDayOfMonth("1.5")).toBeNull()
    expect(parseOverrideDayOfMonth("fifteen")).toBeNull()
  })
})
