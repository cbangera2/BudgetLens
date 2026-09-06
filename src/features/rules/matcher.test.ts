import type { TransactionDraft } from "@/domain/models"

import {
  applyTransactionRulesToDrafts,
  findMatchingTransactionRule,
  matchesTransactionRule,
} from "./matcher"
import type { TransactionRule } from "./model"

function rule(overrides: Partial<TransactionRule> & { id: string }): TransactionRule {
  return {
    merchantSubstring: null,
    amountOperator: null,
    amountMinor: null,
    category: "Synthetic",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function draft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    date: "2026-02-01",
    description: "Synthetic Coffee House",
    amountMinor: -450,
    category: "Uncategorized",
    transactionType: "debit",
    accountName: null,
    accountType: null,
    provider: null,
    labels: [],
    notes: null,
    ...overrides,
  }
}

describe("matchesTransactionRule", () => {
  it("matches merchant substrings case-insensitively", () => {
    const coffee = rule({ id: "a", merchantSubstring: "CoFfEe", category: "Dining" })
    expect(matchesTransactionRule(coffee, draft())).toBe(true)
    expect(matchesTransactionRule(coffee, draft({ description: "Synthetic Bookstore" }))).toBe(
      false,
    )
    expect(matchesTransactionRule(coffee, draft({ description: "" }))).toBe(false)
  })

  it("matches amount operators against signed minor units", () => {
    expect(
      matchesTransactionRule(
        rule({ id: "eq", amountOperator: "eq", amountMinor: -450, category: "X" }),
        draft(),
      ),
    ).toBe(true)
    expect(
      matchesTransactionRule(
        rule({ id: "eq-miss", amountOperator: "eq", amountMinor: -451, category: "X" }),
        draft(),
      ),
    ).toBe(false)
    expect(
      matchesTransactionRule(
        rule({ id: "lt", amountOperator: "lt", amountMinor: -100, category: "X" }),
        draft(),
      ),
    ).toBe(true)
    expect(
      matchesTransactionRule(
        rule({ id: "gt", amountOperator: "gt", amountMinor: -100, category: "X" }),
        draft(),
      ),
    ).toBe(false)
    expect(
      matchesTransactionRule(
        rule({ id: "gte", amountOperator: "gte", amountMinor: -450, category: "X" }),
        draft(),
      ),
    ).toBe(true)
    expect(
      matchesTransactionRule(
        rule({ id: "lte", amountOperator: "lte", amountMinor: -450, category: "X" }),
        draft(),
      ),
    ).toBe(true)
  })

  it("requires every present condition to match", () => {
    const both = rule({
      id: "both",
      merchantSubstring: "coffee",
      amountOperator: "lt",
      amountMinor: -100,
      category: "Dining",
    })
    expect(matchesTransactionRule(both, draft())).toBe(true)
    expect(matchesTransactionRule(both, draft({ description: "Synthetic Bookstore" }))).toBe(false)
    expect(matchesTransactionRule(both, draft({ amountMinor: -50 }))).toBe(false)
  })

  it("never matches a rule without conditions", () => {
    expect(matchesTransactionRule(rule({ id: "empty", category: "X" }), draft())).toBe(false)
  })
})

describe("findMatchingTransactionRule", () => {
  it("uses first-match-wins precedence for overlapping rules", () => {
    const first = rule({ id: "first", merchantSubstring: "synthetic", category: "First" })
    const second = rule({ id: "second", merchantSubstring: "coffee", category: "Second" })
    expect(findMatchingTransactionRule([first, second], draft())?.id).toBe("first")
    expect(findMatchingTransactionRule([second, first], draft())?.id).toBe("second")
  })

  it("passes through when nothing matches", () => {
    const constRules: TransactionRule[] = [
      rule({ id: "x", merchantSubstring: "nope", category: "X" }),
    ]
    expect(findMatchingTransactionRule(constRules, draft())).toBeUndefined()
    expect(findMatchingTransactionRule([], draft())).toBeUndefined()
  })
})

describe("applyTransactionRulesToDrafts", () => {
  it("applies overlapping rules by order and preserves originals", () => {
    const rules = [
      rule({ id: "groceries", merchantSubstring: "mart", category: "Groceries" }),
      rule({ id: "dining", merchantSubstring: "coffee", category: "Dining" }),
      rule({
        id: "big-spend",
        amountOperator: "lte",
        amountMinor: -8000,
        category: "Big Spend",
      }),
    ]
    const drafts = [
      draft({ description: "Synthetic Coffee House", amountMinor: -450 }),
      draft({ description: "Synthetic Grocery Mart", amountMinor: -8210 }),
      draft({ description: "Synthetic Bookstore", amountMinor: -100, category: "Books" }),
    ]
    const result = applyTransactionRulesToDrafts(rules, drafts)

    expect(result.applied.map((item) => item.category)).toEqual(["Dining", "Groceries", "Books"])
    expect(result.matchedRuleIds).toEqual(["dining", "groceries", null])
    expect(result.originalCategories).toEqual(["Uncategorized", "Uncategorized", "Books"])
    // Input drafts are not mutated.
    expect(drafts[0]?.category).toBe("Uncategorized")
  })

  it("reflects edits by changing the applied category", () => {
    const original = rule({ id: "r1", merchantSubstring: "coffee", category: "Dining" })
    const edited: TransactionRule = { ...original, category: "Coffee Shops" }
    expect(applyTransactionRulesToDrafts([original], [draft()]).applied[0]?.category).toBe("Dining")
    expect(applyTransactionRulesToDrafts([edited], [draft()]).applied[0]?.category).toBe(
      "Coffee Shops",
    )
  })

  it("reflects deletion by passing the original category through", () => {
    const before = applyTransactionRulesToDrafts(
      [rule({ id: "r1", merchantSubstring: "coffee", category: "Dining" })],
      [draft({ category: "Uncategorized" })],
    )
    expect(before.applied[0]?.category).toBe("Dining")
    const after = applyTransactionRulesToDrafts([], [draft({ category: "Uncategorized" })])
    expect(after.applied[0]?.category).toBe("Uncategorized")
    expect(after.matchedRuleIds).toEqual([null])
  })

  it("handles null original categories", () => {
    const result = applyTransactionRulesToDrafts([], [draft({ category: null })])
    expect(result.applied[0]?.category).toBeNull()
    expect(result.originalCategories).toEqual([null])
  })
})
