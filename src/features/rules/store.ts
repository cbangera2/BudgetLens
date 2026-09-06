import { useEffect, useState } from "react"

import {
  buildTransactionRule,
  defaultRulesStorage,
  loadTransactionRules,
  moveTransactionRule,
  persistTransactionRules,
  type TransactionRule,
  type TransactionRuleInput,
} from "./model"

export interface TransactionRuleActions {
  addRule: (input: TransactionRuleInput) => TransactionRule
  updateRule: (id: string, input: TransactionRuleInput) => TransactionRule | undefined
  removeRule: (id: string) => void
  moveRule: (id: string, direction: -1 | 1) => void
}

function readRules(storage: Storage | undefined): TransactionRule[] {
  if (!storage) return []
  return loadTransactionRules(storage)
}

export function useTransactionRules(
  storage?: Storage,
): readonly [TransactionRule[], TransactionRuleActions] {
  const resolvedStorage =
    storage ?? (typeof window === "undefined" ? undefined : defaultRulesStorage())
  const [rules, setRules] = useState<TransactionRule[]>(() => readRules(resolvedStorage))

  useEffect(() => {
    persistTransactionRules(rules, resolvedStorage)
  }, [rules, resolvedStorage])

  const actions: TransactionRuleActions = {
    addRule: (input) => {
      const rule = buildTransactionRule(input)
      setRules((current) => [...current, rule])
      return rule
    },
    updateRule: (id, input) => {
      let next: TransactionRule | undefined
      setRules((current) =>
        current.map((rule) => {
          if (rule.id !== id) return rule
          next = buildTransactionRule(input, rule)
          return next
        }),
      )
      return next
    },
    removeRule: (id) => {
      // Deleting a rule only removes the matcher. Already-imported transactions keep
      // whatever category was stored at import time.
      setRules((current) => current.filter((rule) => rule.id !== id))
    },
    moveRule: (id, direction) => {
      setRules((current) => moveTransactionRule(current, id, direction))
    },
  }

  return [rules, actions] as const
}
