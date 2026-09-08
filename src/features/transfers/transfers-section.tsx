import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Transaction } from "@/domain/models"
import { UNDO_TTL_MS } from "@/lib/undo-buffer"

import {
  detectTransferPairs,
  spendingExcludingTransfers,
  transferPairIds,
  type TransferPair,
} from "./detection"
import type { TransferFlagActions, TransferFlags } from "./store"

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    amountMinor / 100,
  )
}

export function pairSelectionKey(pair: TransferPair): string {
  return `${pair.expenseId}::${pair.incomeId}`
}

/**
 * Dismiss-all scoping, mirroring the approve-all selection model: when any
 * suggested pair is checked only the checked subset is targeted, otherwise
 * every visible suggestion is targeted.
 */
export function resolveDismissTargets(
  suggested: readonly TransferPair[],
  selectedKeys: ReadonlySet<string>,
): TransferPair[] {
  const selected = suggested.filter((pair) => selectedKeys.has(pairSelectionKey(pair)))
  return selected.length > 0 ? selected : [...suggested]
}

function dismissToastCopy(count: number): string {
  return count === 1 ? "1 suggested transfer dismissed" : `${count} suggested transfers dismissed`
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
  const {
    flags,
    confirmedIds,
    dismissedIds,
    confirmPair,
    dismissPair,
    dismissPairs,
    restoreTransferFlags,
    clearFlag,
  } = flagActions

  const suggested = useMemo(
    () =>
      pairs.filter(
        (pair) =>
          !dismissedIds.has(pair.expenseId) &&
          !dismissedIds.has(pair.incomeId) &&
          !confirmedIds.has(pair.expenseId) &&
          !confirmedIds.has(pair.incomeId),
      ),
    [pairs, confirmedIds, dismissedIds],
  )
  const confirmed = useMemo(
    () =>
      pairs.filter((pair) => confirmedIds.has(pair.expenseId) && confirmedIds.has(pair.incomeId)),
    [pairs, confirmedIds],
  )
  const totals = spendingExcludingTransfers(transactions, transferPairIds(confirmed))

  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set())
  const suggestedKeyList = useMemo(() => suggested.map(pairSelectionKey), [suggested])
  const suggestedKeySet = useMemo(() => new Set(suggestedKeyList), [suggestedKeyList])
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setSelectedKeys((previous) => {
      let changed = false
      const next = new Set<string>()
      for (const key of previous) {
        if (suggestedKeySet.has(key)) next.add(key)
        else changed = true
      }
      return changed ? next : previous
    })
  }, [suggestedKeySet])

  const selectedSuggested = suggested.filter((pair) => selectedKeys.has(pairSelectionKey(pair)))
  const selectedCount = selectedSuggested.length
  const allSelected = suggested.length > 0 && selectedCount === suggested.length
  const someSelected = selectedCount > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  const toggleSelectAll = () => {
    if (allSelected) setSelectedKeys(new Set())
    else setSelectedKeys(new Set(suggestedKeyList))
  }

  const togglePairSelected = (key: string, checked: boolean) => {
    setSelectedKeys((previous) => {
      const next = new Set(previous)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const approveSelected = () => {
    for (const pair of selectedSuggested) confirmPair(pair.expenseId, pair.incomeId)
    setSelectedKeys((previous) => {
      const approved = new Set(selectedSuggested.map(pairSelectionKey))
      const next = new Set<string>()
      for (const key of previous) {
        if (!approved.has(key)) next.add(key)
      }
      return next
    })
  }

  // Dismiss-all targets the checked subset when any box is checked, else all
  // visible suggestions. Dismissal itself only runs after the confirm dialog
  // below, and stays undoable within the session via the toast action.
  const dismissTargets = useMemo(
    () => resolveDismissTargets(suggested, selectedKeys),
    [suggested, selectedKeys],
  )
  const dismissCount = dismissTargets.length
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false)

  const confirmDismissAll = () => {
    const targets = resolveDismissTargets(suggested, selectedKeys)
    if (targets.length === 0) {
      setDismissConfirmOpen(false)
      return
    }
    const snapshot: TransferFlags = { ...flags }
    const dismissedIdsList = targets.flatMap((pair) => [pair.expenseId, pair.incomeId])
    dismissPairs(targets)
    setSelectedKeys((previous) => {
      const dismissedKeys = new Set(targets.map(pairSelectionKey))
      const next = new Set<string>()
      for (const key of previous) {
        if (!dismissedKeys.has(key)) next.add(key)
      }
      return next
    })
    setDismissConfirmOpen(false)
    toast(dismissToastCopy(targets.length), {
      description: "Undo available for a few seconds.",
      duration: UNDO_TTL_MS,
      action: {
        label: "Undo",
        onClick: () => {
          restoreTransferFlags(snapshot, dismissedIdsList)
          toast.success("Dismissed transfers restored")
        },
      },
    })
  }

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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium">Suggested transfers</h3>
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {selectedCount} of {suggested.length} selected
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          aria-label="Select all suggested transfers"
                        />
                        Select all
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={selectedCount === 0}
                        onClick={approveSelected}
                      >
                        Approve all {selectedCount}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={dismissCount === 0}
                        onClick={() => setDismissConfirmOpen(true)}
                      >
                        Dismiss all {dismissCount}
                      </Button>
                    </div>
                    <ul className="divide-y rounded-xl border">
                      {suggested.map((pair) => {
                        const { title, detail } = pairLabel(pair, byId)
                        const key = pairSelectionKey(pair)
                        return (
                          <li
                            key={`${pair.expenseId}-${pair.incomeId}`}
                            className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                          >
                            <span className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 size-4 accent-primary"
                                checked={selectedKeys.has(key)}
                                onChange={(event) => togglePairSelected(key, event.target.checked)}
                                aria-label={`Select transfer ${title}`}
                              />
                              <span>
                                <span className="block font-medium">{title}</span>
                                <span className="text-xs text-muted-foreground">{detail}</span>
                              </span>
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
      {dismissConfirmOpen && dismissCount > 0 && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDismissConfirmOpen(false)
          }}
        >
          <dialog
            open
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dismiss-all-title"
            aria-describedby="dismiss-all-description"
            className="relative m-0 w-full max-w-md rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle id="dismiss-all-title">
                  Dismiss {dismissCount} suggested {dismissCount === 1 ? "transfer" : "transfers"}?
                </CardTitle>
                <CardDescription id="dismiss-all-description">
                  {selectedCount > 0
                    ? "Only the checked suggestions will be hidden."
                    : "Every visible suggestion will be hidden."}{" "}
                  Dismissed transfers stay dismissed in this browser, but you can undo for a few
                  seconds after dismissing.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={() => setDismissConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDismissAll}>
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          </dialog>
        </div>
      )}
    </section>
  )
}
