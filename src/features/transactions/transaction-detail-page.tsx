import { Link, useNavigate } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { ArrowLeft, Pencil, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"
import type { Transaction } from "@/domain/models"
import { effectiveTransactionAmountMinor } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { formatMoney } from "@/features/dashboard/format"
import { ReceiptSection } from "@/features/receipts/receipt-section"
import { SplitDialog } from "@/features/splits/split-dialog"
import { splitTransaction, unsplitTransaction } from "@/features/splits/split-operations"
import {
  getSplitChildren,
  isSplitChild,
  isSupersededSplitParent,
  splitChildParentId,
} from "@/features/splits/splits"
import { notifyDeletedWithUndo, toastDeleteFailed } from "@/lib/undo-buffer"

import { TransactionForm } from "./transaction-form"

function unique(transactions: readonly Transaction[], field: keyof Transaction): string[] {
  return [
    ...new Set(
      transactions
        .map((transaction) => transaction[field])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].toSorted()
}

function goBackPreservingFilters(event: React.MouseEvent) {
  if (typeof window !== "undefined" && window.history.length > 1) {
    event.preventDefault()
    window.history.back()
  }
}

function useReturnFocusOnClose(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  wasOpenRef: React.RefObject<boolean>,
) {
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    } else if (!open && wasOpenRef.current) {
      const target = triggerRef.current
      triggerRef.current = null
      if (target && target.isConnected) {
        requestAnimationFrame(() => target.focus())
      }
    }
    wasOpenRef.current = open
  }, [open, triggerRef, wasOpenRef])
}

export function TransactionDetailPageContent({ transactionId }: { transactionId: string }) {
  const navigate = useNavigate()
  const editingTriggerRef = useRef<HTMLElement | null>(null)
  const editingWasOpenRef = useRef(false)
  const deletingWasOpenRef = useRef(false)
  const deletingTriggerRef = useRef<HTMLElement | null>(null)
  const splittingTriggerRef = useRef<HTMLElement | null>(null)
  const splittingWasOpenRef = useRef(false)
  const data = useLiveQuery(
    async () =>
      Promise.all([
        repositories.transactions.get(transactionId),
        repositories.transactions.list(),
        repositories.transactionGroups.list(),
      ] as const),
    [transactionId],
  )
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [actionError, setActionError] = useState("")
  useReturnFocusOnClose(editing, editingTriggerRef, editingWasOpenRef)
  useReturnFocusOnClose(deleting, deletingTriggerRef, deletingWasOpenRef)
  useReturnFocusOnClose(splitting, splittingTriggerRef, splittingWasOpenRef)

  const transaction = data?.[0] ?? null
  const allTransactions = useMemo(() => data?.[1] ?? [], [data])
  const groups = useMemo(() => data?.[2] ?? [], [data])
  const group = transaction?.groupId
    ? groups.find((entry) => entry.id === transaction.groupId)
    : undefined
  const splitChildren = useMemo(
    () => (transaction ? getSplitChildren(allTransactions, transaction.id) : []),
    [allTransactions, transaction],
  )
  const isSuperseded = transaction ? isSupersededSplitParent(transaction) : false
  const isChild = transaction ? isSplitChild(transaction) : false
  const splitParent = useMemo(() => {
    if (!transaction) return undefined
    const parentId = splitChildParentId(transaction)
    return parentId ? allTransactions.find((entry) => entry.id === parentId) : undefined
  }, [allTransactions, transaction])
  const canSplit = Boolean(transaction) && !isSuperseded && !isChild && splitChildren.length === 0
  const canUnsplit = splitChildren.length > 0 || isSuperseded

  if (!data) return <output>Loading transaction…</output>

  if (!transaction) {
    return (
      <div className="grid gap-4">
        <div>
          <Button variant="ghost" className="mb-2 -ml-2" asChild>
            <Link to="/transactions" onClick={goBackPreservingFilters}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Transactions
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Transaction not found</h1>
          <p className="mt-1 text-muted-foreground">
            This transaction no longer exists. It may have been deleted or imported in another
            browser profile.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/transactions" onClick={goBackPreservingFilters}>
              Back to transactions
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/imports">Open imports</Link>
          </Button>
        </div>
      </div>
    )
  }

  const normalized = normalizeTransactionAmountMinor(
    transaction.amountMinor,
    transaction.transactionType,
  )
  const effective = effectiveTransactionAmountMinor(
    normalized,
    transaction.shared,
    transaction.shareCount,
  )

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-2 -ml-2" asChild>
            <Link to="/transactions" onClick={goBackPreservingFilters}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Transactions
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">{transaction.description}</h1>
          <p className="mt-1 text-muted-foreground">
            {transaction.date} · {formatMoney(normalized)}
            {effective !== normalized ? ` · your share ${formatMoney(effective)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {canSplit && (
            <Button
              variant="outline"
              onClick={() => {
                setActionError("")
                setSplitting(true)
              }}
            >
              Split
            </Button>
          )}
          {canUnsplit && (
            <Button
              variant="outline"
              onClick={() => {
                setActionError("")
                void (async () => {
                  try {
                    await unsplitTransaction(repositories, transaction.id)
                  } catch (cause) {
                    setActionError(
                      cause instanceof Error ? cause.message : "The split could not be removed.",
                    )
                  }
                })()
              }}
            >
              Unsplit
            </Button>
          )}
          <Button
            variant="outline"
            disabled={isSuperseded || isChild}
            title={
              isSuperseded
                ? "Unsplit before editing."
                : isChild
                  ? "Unsplit to edit parts."
                  : undefined
            }
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" aria-hidden="true" /> Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" aria-hidden="true" /> Delete
          </Button>
        </div>
      </div>
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {isSuperseded && (
        <Card aria-label="Split status">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">Split across {splitChildren.length} categories</p>
            <p className="mt-1 text-muted-foreground">
              Original row, excluded from totals. Parts sum to {formatMoney(normalized)}.
            </p>
          </CardContent>
        </Card>
      )}
      {isChild && splitParent && (
        <Card aria-label="Split part status">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium">
              Part of{" "}
              <Link
                to="/transactions/$transactionId"
                params={{ transactionId: splitParent.id }}
                className="text-primary underline underline-offset-4"
              >
                {splitParent.description}
              </Link>
            </p>
            <p className="mt-1 text-muted-foreground">Unsplit the original to restore it.</p>
          </CardContent>
        </Card>
      )}

      {splitChildren.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Split parts</CardTitle>
            <CardDescription>One category per part.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {splitChildren.map((child) => (
                <li key={child.id} className="flex items-center justify-between gap-4 py-2">
                  <Link
                    to="/transactions/$transactionId"
                    params={{ transactionId: child.id }}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {child.description}
                  </Link>
                  <span className="text-muted-foreground">
                    {child.category ?? "Uncategorized"} ·{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatMoney(
                        normalizeTransactionAmountMinor(child.amountMinor, child.transactionType),
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Full fields for this transaction.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="font-medium">{transaction.date}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-medium tabular-nums">{formatMoney(normalized)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Merchant</dt>
              <dd className="font-medium">
                <Link
                  to="/transactions"
                  search={{ merchant: transaction.description }}
                  className="text-primary underline underline-offset-4"
                >
                  {transaction.description}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="font-medium">
                {transaction.category ? (
                  <Link
                    to="/transactions"
                    search={{ category: transaction.category }}
                    className="text-primary underline underline-offset-4"
                  >
                    {transaction.category}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Uncategorized</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-medium">
                {transaction.accountName ? (
                  <Link
                    to="/transactions"
                    search={{ account: transaction.accountName }}
                    className="text-primary underline underline-offset-4"
                  >
                    {transaction.accountName}
                  </Link>
                ) : (
                  "—"
                )}
                {transaction.accountType ? (
                  <span className="block text-xs text-muted-foreground">
                    {transaction.accountType}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Provider / type</dt>
              <dd className="font-medium">
                {transaction.provider ?? "—"}
                {transaction.transactionType ? (
                  <span className="block text-xs text-muted-foreground">
                    {transaction.transactionType}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Group</dt>
              <dd className="font-medium">
                {group ? (
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: group.id }}
                    className="text-primary underline underline-offset-4"
                  >
                    {group.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No group</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sharing</dt>
              <dd className="font-medium">
                {transaction.shared ? `Shared ÷${transaction.shareCount}` : "Not shared"}
              </dd>
            </div>
          </dl>
          {transaction.notes ? (
            <div className="mt-4 grid gap-1 text-sm">
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{transaction.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
          <CardDescription>Photos attached to this transaction.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReceiptSection transactionId={transaction.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Find similar</CardTitle>
          <CardDescription>Open the Transactions view pre-filtered to a facet.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/transactions" search={{ merchant: transaction.description }}>
              Same merchant
            </Link>
          </Button>
          {transaction.category ? (
            <Button variant="outline" asChild>
              <Link to="/transactions" search={{ category: transaction.category }}>
                Same category
              </Link>
            </Button>
          ) : null}
          {transaction.accountName ? (
            <Button variant="outline" asChild>
              <Link to="/transactions" search={{ account: transaction.accountName }}>
                Same account
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link to="/transactions" search={{ importBatch: transaction.importBatchId }}>
              View import batch
            </Link>
          </Button>
        </CardContent>
      </Card>

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(false)
          }}
        >
          <dialog
            open
            aria-modal="true"
            aria-labelledby="transaction-form-title"
            className="relative m-0 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <Card className="border-0 shadow-none">
              <CardHeader className="pr-16">
                <CardTitle id="transaction-form-title">Edit {transaction.description}</CardTitle>
                <CardDescription>
                  Expenses use negative amounts; income and refunds use positive amounts.
                </CardDescription>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute top-4 right-4"
                  aria-label="Close transaction form"
                  onClick={() => setEditing(false)}
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <TransactionForm
                  key={transaction.id}
                  transaction={transaction}
                  groups={groups}
                  fieldOptions={{
                    category: unique(allTransactions, "category"),
                    transactionType: unique(allTransactions, "transactionType"),
                    accountName: unique(allTransactions, "accountName"),
                    accountType: unique(allTransactions, "accountType"),
                    provider: unique(allTransactions, "provider"),
                  }}
                  onSubmit={async (draft) => {
                    await repositories.transactions.update(transaction.id, draft)
                    setEditing(false)
                  }}
                  onCancel={() => setEditing(false)}
                />
              </CardContent>
            </Card>
          </dialog>
        </div>
      )}

      {splitting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSplitting(false)
          }}
        >
          <dialog
            open
            aria-modal="true"
            aria-labelledby="split-form-title"
            className="relative m-0 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <Card className="border-0 shadow-none">
              <CardHeader className="pr-16">
                <CardTitle id="split-form-title">Split {transaction.description}</CardTitle>
                <CardDescription>
                  One part per category; amounts must total {formatMoney(normalized)}.
                </CardDescription>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute top-4 right-4"
                  aria-label="Close split form"
                  onClick={() => setSplitting(false)}
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <SplitDialog
                  parent={transaction}
                  existingCategories={unique(allTransactions, "category")}
                  onClose={() => setSplitting(false)}
                  onSplit={async (parts) => {
                    await splitTransaction(repositories, transaction.id, parts)
                    setSplitting(false)
                  }}
                />
              </CardContent>
            </Card>
          </dialog>
        </div>
      )}

      {deleting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleting(false)
          }}
        >
          <dialog
            open
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-description"
            className="relative m-0 w-full max-w-md rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle id="delete-title">Delete transaction?</CardTitle>
                <CardDescription id="delete-description">
                  {splitChildren.length > 0 ? (
                    <>Split into {splitChildren.length} parts. Unsplit first to delete it.</>
                  ) : isChild ? (
                    <>This is a split part. Unsplit the original first.</>
                  ) : (
                    <>This permanently removes {transaction.description} from this browser.</>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={() => setDeleting(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={splitChildren.length > 0 || isChild}
                  onClick={() => {
                    const snapshot = transaction
                    void (async () => {
                      try {
                        await repositories.transactions.remove(snapshot.id)
                      } catch {
                        toastDeleteFailed("Transaction")
                        return
                      }
                      notifyDeletedWithUndo("Transaction", {
                        kind: "transaction",
                        transaction: snapshot,
                      })
                      await navigate({ to: "/transactions" })
                    })()
                  }}
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          </dialog>
        </div>
      )}
    </div>
  )
}
