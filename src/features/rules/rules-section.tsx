import { useState, type FormEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  amountOperatorLabel,
  describeTransactionRule,
  formatRuleAmountMinor,
  TRANSACTION_RULE_AMOUNT_OPERATORS,
  validateTransactionRuleInput,
  type TransactionRule,
  type TransactionRuleInput,
} from "./model"
import type { TransactionRuleActions } from "./store"

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const emptyInput: TransactionRuleInput = {
  merchantSubstring: "",
  amountOperator: "",
  amountDollars: "",
  category: "",
}

function toInput(rule: TransactionRule): TransactionRuleInput {
  return {
    merchantSubstring: rule.merchantSubstring ?? "",
    amountOperator: rule.amountOperator ?? "",
    amountDollars:
      rule.amountMinor === null ? "" : (rule.amountMinor / 100).toFixed(2).replace(/\.00$/, ".00"),
    category: rule.category,
  }
}

interface RulesSectionProps {
  rules: readonly TransactionRule[]
  actions: TransactionRuleActions
}

export function RulesSection({ rules, actions }: RulesSectionProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [input, setInput] = useState<TransactionRuleInput>(emptyInput)
  const [error, setError] = useState("")

  function beginCreate() {
    setEditingId(null)
    setInput(emptyInput)
    setError("")
    setShowForm(true)
  }

  function beginEdit(rule: TransactionRule) {
    setEditingId(rule.id)
    setInput(toInput(rule))
    setError("")
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false)
    setEditingId(null)
    setInput(emptyInput)
    setError("")
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const failure = validateTransactionRuleInput(input)
    if (failure) {
      setError(failure)
      return
    }
    if (editingId) {
      actions.updateRule(editingId, input)
    } else {
      actions.addRule(input)
    }
    cancel()
  }

  return (
    <Card aria-labelledby="transaction-rules-title">
      <CardHeader>
        <CardTitle id="transaction-rules-title">Transaction rules</CardTitle>
        <CardDescription>
          Rules match the merchant name and/or amount, then set the category during import preview.
          The first matching rule wins. Deleting a rule never changes already-imported transactions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">
            No rules yet. Add one to categorize matching imports automatically.
          </p>
        ) : null}

        {rules.length > 0 ? (
          <ol className="space-y-2">
            {rules.map((rule, index) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-secondary text-xs">
                      {index + 1}
                    </span>
                    {rule.category}
                  </p>
                  <p className="text-xs text-muted-foreground">{describeTransactionRule(rule)}</p>
                  <p className="text-xs text-muted-foreground">
                    {rule.merchantSubstring
                      ? `Merchant contains "${rule.merchantSubstring}"`
                      : "Any merchant"}
                    {rule.amountOperator && rule.amountMinor !== null
                      ? ` · Amount ${amountOperatorLabel(rule.amountOperator)} ${formatRuleAmountMinor(rule.amountMinor)}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="secondary">Rule {index + 1}</Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    aria-label={`Move ${rule.category} rule up`}
                    onClick={() => actions.moveRule(rule.id, -1)}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === rules.length - 1}
                    aria-label={`Move ${rule.category} rule down`}
                    onClick={() => actions.moveRule(rule.id, 1)}
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit ${rule.category} rule`}
                    onClick={() => beginEdit(rule)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${rule.category} rule`}
                    onClick={() => {
                      if (editingId === rule.id) cancel()
                      actions.removeRule(rule.id)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {!showForm ? (
          <Button type="button" variant="outline" onClick={beginCreate}>
            Add rule
          </Button>
        ) : (
          <form
            aria-label={editingId ? "Edit transaction rule" : "Add transaction rule"}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
            onSubmit={submit}
            noValidate
          >
            {error ? (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="rule-merchant">Merchant contains</Label>
              <Input
                id="rule-merchant"
                placeholder="e.g. coffee"
                autoComplete="off"
                value={input.merchantSubstring}
                onChange={(event) =>
                  setInput((current) => ({ ...current, merchantSubstring: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">Case-insensitive substring match.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-category">Rule category</Label>
              <Input
                id="rule-category"
                placeholder="e.g. Dining"
                required
                maxLength={100}
                autoComplete="off"
                value={input.category}
                onChange={(event) =>
                  setInput((current) => ({ ...current, category: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-amount-operator">Amount condition</Label>
              <select
                id="rule-amount-operator"
                className={selectClass}
                value={input.amountOperator}
                onChange={(event) =>
                  setInput((current) => ({ ...current, amountOperator: event.target.value }))
                }
              >
                <option value="">No amount condition</option>
                {TRANSACTION_RULE_AMOUNT_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>
                    {amountOperatorLabel(operator)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-amount">Amount</Label>
              <Input
                id="rule-amount"
                placeholder="e.g. 10.00"
                inputMode="decimal"
                autoComplete="off"
                disabled={!input.amountOperator}
                value={input.amountDollars}
                onChange={(event) =>
                  setInput((current) => ({ ...current, amountDollars: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Compared against the signed import amount.
              </p>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit">{editingId ? "Save rule" : "Add rule"}</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
