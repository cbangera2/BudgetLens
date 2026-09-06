import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Transaction } from "@/domain/models"

import { detectTransferPairs, spendingExcludingTransfers, type TransferPair } from "./detection"
import type { TransferFlagActions } from "./store"

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    amountMinor / 100,
  )
}

export function TransferBadge() {
  return <Badge variant="secondary">Transfer</Badge>
}

function pairLabel(
  pair: TransferPair,
  byId: Map<string, Transaction>,
): { title: string; detail: string } {
  const expense = byId.get(pair.expenseId)
  const income = byId.get(pair.incomeId)
  const title =
    expense && income ? `${expense.description} and ${income.description}` : pair.expenseId
  const detail = `${formatMoney(pair.amountMinor)} · ${pair.fromAccount} to ${pair.toAccount} · ${pair.dateGapDays}d apart`
  return { title, detail }
}

export function TransfersSection({
  transactions,
  flagActions,
}: {
  transactions: readonly Transaction[]
  flagActions: TransferFlagActions
}) {
  const byId = useMemo(() => new Map(transactions.map((row) => [row.id, row])), [transactions])
  const pairs = useMemo(() => detectTransferPairs(transactions), [transactions])
  const { confirmedIds, dismissedIds, confirmPair, dismissPair, clearFlag } = flagActions

  const suggested = pairs.filter(
    (pair) =>
      !dismissedIds.has(pair.expenseId) &&
      !dismissedIds.has(pair.incomeId) &&
      !confirmedIds.has(pair.expenseId) &&
      !confirmedIds.has(pair.incomeId),
  )
  const confirmed = pairs.filter(
    (pair) => confirmedIds.has(pair.expenseId) || confirmedIds.has(pair.incomeId),
  )
  const totals = spendingExcludingTransfers(transactions, confirmedIds)

  return (
    <section aria-label="Transfers">
      <Card>
        <CardHeader>
          <CardTitle>Transfers</CardTitle>
          <CardDescription>
            Moves between your own accounts. Confirmed transfers are excluded from spending.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <p className="text-sm" aria-live="polite">
              Spending excluding transfers:{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(totals.spendingMinor)}
              </span>{" "}
              <span className="text-muted-foreground">
                (excluded {totals.excludedCount} transfer{" "}
                {totals.excludedCount === 1 ? "row" : "rows"} · {formatMoney(totals.excludedMinor)})
              </span>
            </p>
            {pairs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transfers detected yet.</p>
            ) : (
              <>
                {suggested.length > 0 && (
                  <div className="grid gap-2">
                    <h3 className="text-sm font-medium">Suggested transfers</h3>
                    <ul className="divide-y rounded-xl border">
                      {suggested.map((pair) => {
                        const { title, detail } = pairLabel(pair, byId)
                        return (
                          <li
                            key={`${pair.expenseId}-${pair.incomeId}`}
                            className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                          >
                            <span>
                              <span className="block font-medium">{title}</span>
                              <span className="text-xs text-muted-foreground">{detail}</span>
                            </span>
                            <span className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Confirm transfer ${title}`}
                                onClick={() => confirmPair(pair.expenseId, pair.incomeId)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Dismiss transfer ${title}`}
                                onClick={() => dismissPair(pair.expenseId, pair.incomeId)}
                              >
                                Dismiss
                              </Button>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
                {confirmed.length > 0 && (
                  <div className="grid gap-2">
                    <h3 className="text-sm font-medium">Confirmed transfers</h3>
                    <ul className="divide-y rounded-xl border">
                      {confirmed.map((pair) => {
                        const { title, detail } = pairLabel(pair, byId)
                        return (
                          <li
                            key={`confirmed-${pair.expenseId}-${pair.incomeId}`}
                            className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                          >
                            <span>
                              <span className="flex items-center gap-2 font-medium">
                                {title} <TransferBadge />
                              </span>
                              <span className="text-xs text-muted-foreground">{detail}</span>
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Undo transfer ${title}`}
                              onClick={() => {
                                clearFlag(pair.expenseId)
                                clearFlag(pair.incomeId)
                              }}
                            >
                              Undo
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
                {suggested.length === 0 && confirmed.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    All detected transfers were dismissed.
                  </p>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
