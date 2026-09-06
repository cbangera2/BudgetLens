import {
  buildTransactionRule,
  loadTransactionRules,
  moveTransactionRule,
  normalizeTransactionRules,
  parseRuleAmountDollarsToMinor,
  persistTransactionRules,
  TRANSACTION_RULES_STORAGE_KEY,
  validateTransactionRuleInput,
} from "./model"

function storageWith(value: string | null): Storage {
  const data = new Map<string, string>()
  if (value !== null) data.set(TRANSACTION_RULES_STORAGE_KEY, value)
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, next: string) => void data.set(key, next),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
  } satisfies Storage
}

describe("validateTransactionRuleInput", () => {
  it("requires a category and at least one condition", () => {
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "",
        amountOperator: "",
        amountDollars: "",
        category: "",
      }),
    ).toMatch(/category/i)
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "",
        amountOperator: "",
        amountDollars: "",
        category: "Dining",
      }),
    ).toMatch(/merchant/i)
  })

  it("accepts merchant-only, amount-only, and combined rules", () => {
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "coffee",
        amountOperator: "",
        amountDollars: "",
        category: "Dining",
      }),
    ).toBeNull()
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "",
        amountOperator: "lt",
        amountDollars: "10.00",
        category: "Small",
      }),
    ).toBeNull()
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "mart",
        amountOperator: "gte",
        amountDollars: "50",
        category: "Groceries",
      }),
    ).toBeNull()
  })

  it("rejects mismatched amount operator and amount pairs", () => {
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "coffee",
        amountOperator: "lt",
        amountDollars: "",
        category: "Dining",
      }),
    ).toMatch(/amount/i)
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "",
        amountOperator: "",
        amountDollars: "10.00",
        category: "Dining",
      }),
    ).toMatch(/amount/i)
    expect(
      validateTransactionRuleInput({
        merchantSubstring: "coffee",
        amountOperator: "lt",
        amountDollars: "not-money",
        category: "Dining",
      }),
    ).toMatch(/amount/i)
  })
})

describe("parseRuleAmountDollarsToMinor", () => {
  it("parses signed dollar strings to minor units", () => {
    expect(parseRuleAmountDollarsToMinor("10")).toBe(1000)
    expect(parseRuleAmountDollarsToMinor("10.50")).toBe(1050)
    expect(parseRuleAmountDollarsToMinor("-4.50")).toBe(-450)
    expect(parseRuleAmountDollarsToMinor("$1,234.56")).toBe(123456)
    expect(parseRuleAmountDollarsToMinor("")).toBeNull()
    expect(parseRuleAmountDollarsToMinor("10.999")).toBeNull()
    expect(parseRuleAmountDollarsToMinor("not-money")).toBeNull()
  })
})

describe("buildTransactionRule", () => {
  it("trims fields and preserves identity on edit", () => {
    const created = buildTransactionRule({
      merchantSubstring: "  Coffee ",
      amountOperator: "lt",
      amountDollars: "10.00",
      category: "  Dining ",
    })
    expect(created).toMatchObject({
      merchantSubstring: "Coffee",
      amountOperator: "lt",
      amountMinor: 1000,
      category: "Dining",
    })
    const edited = buildTransactionRule(
      {
        merchantSubstring: "tea",
        amountOperator: "",
        amountDollars: "",
        category: "Cafes",
      },
      created,
    )
    expect(edited.id).toBe(created.id)
    expect(edited.createdAt).toBe(created.createdAt)
    expect(edited).toMatchObject({
      merchantSubstring: "tea",
      amountOperator: null,
      amountMinor: null,
      category: "Cafes",
    })
  })
})

describe("normalizeTransactionRules", () => {
  it("drops invalid and duplicate rules while preserving order", () => {
    const valid = buildTransactionRule({
      merchantSubstring: "coffee",
      amountOperator: "",
      amountDollars: "",
      category: "Dining",
    })
    const normalized = normalizeTransactionRules([
      valid,
      { ...valid },
      { id: "", category: "" },
      { id: "no-conditions", category: "X" },
      "not-an-object",
    ])
    expect(normalized).toEqual([valid])
  })
})

describe("transaction rules persistence", () => {
  it("round-trips through storage and tolerates corrupt payloads", () => {
    const rules = [
      buildTransactionRule({
        merchantSubstring: "coffee",
        amountOperator: "",
        amountDollars: "",
        category: "Dining",
      }),
    ]
    const storage = storageWith(null)
    persistTransactionRules(rules, storage)
    expect(loadTransactionRules(storage)).toEqual(rules)
    expect(loadTransactionRules(storageWith("{not-json"))).toEqual([])
    expect(loadTransactionRules(storageWith('{"unexpected":true}'))).toEqual([])
    expect(loadTransactionRules(undefined)).toEqual([])
  })
})

describe("moveTransactionRule", () => {
  it("reorders rules so earlier entries win", () => {
    const first = buildTransactionRule({
      merchantSubstring: "a",
      amountOperator: "",
      amountDollars: "",
      category: "First",
    })
    const second = buildTransactionRule({
      merchantSubstring: "b",
      amountOperator: "",
      amountDollars: "",
      category: "Second",
    })
    const rules = [first, second]
    expect(moveTransactionRule(rules, second.id, -1).map((rule) => rule.id)).toEqual([
      second.id,
      first.id,
    ])
    expect(moveTransactionRule(rules, first.id, -1)).toEqual(rules)
    expect(moveTransactionRule(rules, second.id, 1)).toEqual(rules)
    expect(moveTransactionRule(rules, "missing", 1)).toEqual(rules)
  })
})
