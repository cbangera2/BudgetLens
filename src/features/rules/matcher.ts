import type { TransactionDraft } from "@/domain/models"

import type { TransactionRule } from "./model"

export interface TransactionRuleTarget {
  description: string
  amountMinor: number
}

function toTarget(
  draft: Pick<TransactionDraft, "description" | "amountMinor"> | TransactionRuleTarget,
): TransactionRuleTarget {
  return { description: draft.description ?? "", amountMinor: draft.amountMinor }
}

export function matchesTransactionRule(
  rule: TransactionRule,
  draft: Pick<TransactionDraft, "description" | "amountMinor"> | TransactionRuleTarget,
): boolean {
  const target = toTarget(draft)
  if (!rule.merchantSubstring && !rule.amountOperator) return false

  if (rule.merchantSubstring) {
    const needle = rule.merchantSubstring.toLowerCase()
    const haystack = (target.description ?? "").toLowerCase()
    if (!haystack.includes(needle)) return false
  }

  if (rule.amountOperator && rule.amountMinor !== null) {
    const amount = target.amountMinor
    const expected = rule.amountMinor
    switch (rule.amountOperator) {
      case "eq":
        if (amount !== expected) return false
        break
      case "gt":
        if (!(amount > expected)) return false
        break
      case "gte":
        if (!(amount >= expected)) return false
        break
      case "lt":
        if (!(amount < expected)) return false
        break
      case "lte":
        if (!(amount <= expected)) return false
        break
    }
  }

  return true
}

export function findMatchingTransactionRule(
  rules: readonly TransactionRule[],
  draft: Pick<TransactionDraft, "description" | "amountMinor"> | TransactionRuleTarget,
): TransactionRule | undefined {
  return rules.find((rule) => matchesTransactionRule(rule, draft))
}

export interface AppliedTransactionRules {
  applied: TransactionDraft[]
  matchedRuleIds: (string | null)[]
  originalCategories: (string | null)[]
}

export function applyTransactionRulesToDrafts(
  rules: readonly TransactionRule[],
  drafts: readonly TransactionDraft[],
): AppliedTransactionRules {
  if (rules.length === 0) {
    return {
      applied: [...drafts],
      matchedRuleIds: drafts.map(() => null),
      originalCategories: drafts.map((draft) => draft.category ?? null),
    }
  }
  const applied: TransactionDraft[] = []
  const matchedRuleIds: (string | null)[] = []
  const originalCategories: (string | null)[] = []
  for (const draft of drafts) {
    const match = findMatchingTransactionRule(rules, draft)
    originalCategories.push(draft.category ?? null)
    if (match) {
      matchedRuleIds.push(match.id)
      applied.push({ ...draft, category: match.category })
    } else {
      matchedRuleIds.push(null)
      applied.push({ ...draft })
    }
  }
  return { applied, matchedRuleIds, originalCategories }
}
