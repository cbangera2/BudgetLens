import { matchesAmountConditions, parseSearchQuery } from "./search-operators"

describe("search operators", () => {
  it("parses amount comparisons as integer minor units", () => {
    expect(parseSearchQuery("amount:>100").amounts).toEqual([
      expect.objectContaining({ op: "gt", valueMinor: 10_000 }),
    ])
    expect(parseSearchQuery("amount:<50").amounts).toEqual([
      expect.objectContaining({ op: "lt", valueMinor: 5_000 }),
    ])
    expect(parseSearchQuery("amount:>=100.50").amounts).toEqual([
      expect.objectContaining({ op: "gte", valueMinor: 10_050 }),
    ])
    expect(parseSearchQuery("amount:<=-20").amounts).toEqual([
      expect.objectContaining({ op: "lte", valueMinor: -2_000 }),
    ])
    expect(parseSearchQuery("amount:=42").amounts).toEqual([
      expect.objectContaining({ op: "eq", valueMinor: 4_200 }),
    ])
    expect(parseSearchQuery("amount:42").amounts).toEqual([
      expect.objectContaining({ op: "eq", valueMinor: 4_200 }),
    ])
  })

  it("handles negative and decimal amounts exactly", () => {
    expect(parseSearchQuery("amount:>-100.25").amounts[0]).toMatchObject({
      op: "gt",
      valueMinor: -10_025,
    })
    expect(parseSearchQuery("amount:<-20").amounts[0]).toMatchObject({
      op: "lt",
      valueMinor: -2_000,
    })
    // $0.07 stays exact in minor units.
    expect(parseSearchQuery("amount:=0.07").amounts[0]).toMatchObject({
      op: "eq",
      valueMinor: 7,
    })
  })

  it("parses merchant and category prefixes, including quoted values", () => {
    expect(parseSearchQuery('merchant:"Coffee Shop"')).toMatchObject({
      merchant: "Coffee Shop",
      text: "",
    })
    expect(parseSearchQuery("merchant:deli").merchant).toBe("deli")
    expect(parseSearchQuery("merchant:'Corner Deli'").merchant).toBe("Corner Deli")
    expect(parseSearchQuery('cat:"Dining Out"')).toMatchObject({
      category: "Dining Out",
      text: "",
    })
    expect(parseSearchQuery("category:Groceries").category).toBe("Groceries")
  })

  it("keeps residual plain text alongside operators and exposes hint chips", () => {
    const parsed = parseSearchQuery("coffee amount:>100 merchant:deli")
    expect(parsed.text).toBe("coffee")
    expect(parsed.amounts).toHaveLength(1)
    expect(parsed.merchant).toBe("deli")
    expect(parsed.chips.map(({ label }) => label)).toEqual([
      "Amount > 100",
      'Merchant contains "deli"',
    ])
  })

  it("falls back to plain text for unknown operators instead of erroring", () => {
    const parsed = parseSearchQuery("frobnicate:xyz coffee")
    expect(parsed.amounts).toEqual([])
    expect(parsed.merchant).toBeNull()
    expect(parsed.category).toBeNull()
    expect(parsed.chips).toEqual([])
    expect(parsed.text).toBe("frobnicate:xyz coffee")
  })

  it("treats malformed operator values as plain text", () => {
    expect(parseSearchQuery("amount:abc").text).toBe("amount:abc")
    expect(parseSearchQuery("amount:").text).toBe("amount:")
    expect(parseSearchQuery("merchant:").text).toBe("merchant:")
    expect(parseSearchQuery("amount:>abc").amounts).toEqual([])
  })

  it("matches prefixes case-insensitively and handles empty input", () => {
    expect(parseSearchQuery("AMOUNT:>100").amounts).toHaveLength(1)
    expect(parseSearchQuery("Merchant:Deli").merchant).toBe("Deli")
    expect(parseSearchQuery("CAT:Food").category).toBe("Food")
    expect(parseSearchQuery("   ")).toMatchObject({ text: "", amounts: [], chips: [] })
    expect(parseSearchQuery("")).toMatchObject({ text: "", amounts: [], chips: [] })
  })

  it("supports combined amount bounds as a range", () => {
    const parsed = parseSearchQuery("amount:>100 amount:<500")
    expect(parsed.amounts).toHaveLength(2)
    expect(matchesAmountConditions(20_000, parsed.amounts)).toBe(true)
    expect(matchesAmountConditions(-20_000, parsed.amounts)).toBe(true)
    expect(matchesAmountConditions(5_000, parsed.amounts)).toBe(false)
    expect(matchesAmountConditions(60_000, parsed.amounts)).toBe(false)
  })

  it("compares by absolute magnitude so expenses match naturally", () => {
    const big = parseSearchQuery("amount:>100").amounts
    expect(matchesAmountConditions(-25_000, big)).toBe(true)
    expect(matchesAmountConditions(250_000, big)).toBe(true)
    expect(matchesAmountConditions(-875, big)).toBe(false)
    // Negative thresholds stay graceful via their absolute value.
    expect(matchesAmountConditions(-875, parseSearchQuery("amount:<-20").amounts)).toBe(true)
  })

  it("evaluates every comparison without throwing", () => {
    const cases = [
      { raw: "amount:>100", probe: 10_001, expected: true },
      { raw: "amount:>100", probe: 10_000, expected: false },
      { raw: "amount:>=100", probe: 10_000, expected: true },
      { raw: "amount:<50", probe: 4_999, expected: true },
      { raw: "amount:<50", probe: 5_000, expected: false },
      { raw: "amount:<=50", probe: 5_000, expected: true },
      { raw: "amount:=42", probe: 4_200, expected: true },
      { raw: "amount:=42", probe: 4_201, expected: false },
      { raw: "amount:>100", probe: -25_000, expected: true },
      { raw: "amount:<50", probe: -4_999, expected: true },
      { raw: "amount:=42", probe: -4_200, expected: true },
    ] as const
    for (const { raw, probe, expected } of cases) {
      expect(matchesAmountConditions(probe, parseSearchQuery(raw).amounts)).toBe(expected)
    }
    expect(matchesAmountConditions(1, [])).toBe(true)
  })
})
