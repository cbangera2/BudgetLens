import { describe, expect, it } from "vitest"

import { fuzzyScore } from "@/features/palette/fuzzy"

describe("fuzzyScore", () => {
  it("returns 0 for an empty query", () => {
    expect(fuzzyScore("", "Settings")).toBe(0)
    expect(fuzzyScore("   ", "Settings")).toBe(0)
  })

  it("matches case-insensitively", () => {
    expect(fuzzyScore("BUDGET", "Go to Budgets")).not.toBeNull()
    expect(fuzzyScore("settings", "Settings")).toBe(fuzzyScore("SETTINGS", "Settings"))
  })

  it("tolerates a missing character", () => {
    expect(fuzzyScore("setings", "Settings")).not.toBeNull()
  })

  it("tolerates a substituted character", () => {
    expect(fuzzyScore("setxings", "Settings")).not.toBeNull()
  })

  it("tolerates a transposed pair", () => {
    expect(fuzzyScore("transactoin", "Transactions")).not.toBeNull()
  })

  it("ranks exact matches above typo matches", () => {
    const exact = fuzzyScore("settings", "Settings")
    const typo = fuzzyScore("setxings", "Settings")
    if (typeof exact !== "number" || typeof typo !== "number") {
      throw new Error("expected both queries to match")
    }
    expect(exact).toBeGreaterThan(typo)
  })

  it("prefers word-boundary matches over mid-word ones", () => {
    const boundary = fuzzyScore("net", "Net worth")
    const midword = fuzzyScore("net", "Planet")
    if (typeof boundary !== "number" || typeof midword !== "number") {
      throw new Error("expected both queries to match")
    }
    expect(boundary).toBeGreaterThan(midword)
  })

  it("returns null when the query cannot match", () => {
    expect(fuzzyScore("zzz", "Settings")).toBeNull()
    expect(fuzzyScore("qwerty", "Settings")).toBeNull()
    expect(fuzzyScore("x", "Settings")).toBeNull()
  })

  it("keeps short queries strict (no typo allowance)", () => {
    expect(fuzzyScore("sw", "Settings")).toBeNull()
    expect(fuzzyScore("set", "Settings")).not.toBeNull()
  })
})
