import { useLiveQuery } from "dexie-react-hooks"
import { Pencil, Plus, Trash2, Users, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import type { Transaction, TransactionDraft } from "@/domain/models"
import { DEFAULT_SHARE_COUNT, effectiveTransactionAmountMinor } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { formatMoney } from "@/features/dashboard/format"

import {
  defaultTransactionFilters,
  filterAndSortTransactions,
  isTransactionSort,
  parseTransactionFilters,
  serializeTransactionFilters,
  type TransactionViewFilters,
} from "./filtering"
import { TransactionForm } from "./transaction-form"

const pageSize = 50
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

function unique(transactions: readonly Transaction[], field: keyof Transaction): string[] {
  return [
    ...new Set(
      transactions
        .map((transaction) => transaction[field])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].toSorted()
}

export function TransactionsPageContent() {
  const data = useLiveQuery(
    async () =>
      Promise.all([
        repositories.transactions.list(),
        repositories.transactionGroups.list(),
      ] as const),
    [],
  )
  const transactions = data?.[0]
  const groups = data?.[1] ?? []
  const [filters, setFilters] = useState(() => parseTransactionFilters(location.search))
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Transaction | "new" | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkSplit, setBulkSplit] = useState(String(DEFAULT_SHARE_COUNT))

  useEffect(() => {
    const query = serializeTransactionFilters(filters)
    history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}`)
    setPage(1)
  }, [filters])

  useEffect(() => {
    if (!editing && !deleting) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (deleting) setDeleting(null)
      else setEditing(null)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [deleting, editing])

  const visible = useMemo(
    () => filterAndSortTransactions(transactions ?? [], filters),
    [transactions, filters],
  )
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize)
  const patchFilter = (patch: Partial<TransactionViewFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))

  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const pageSelection = pageRows.filter((row) => selected.has(row.id))
  const allPageSelected = pageRows.length > 0 && pageSelection.length === pageRows.length
  function toggleSelectAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const row of pageRows) {
        if (checked) next.add(row.id)
        else next.delete(row.id)
      }
      return next
    })
  }

  async function bulkApply(changes: Partial<TransactionDraft>) {
    await repositories.transactions.updateMany([...selected], changes)
    setSelected(new Set())
  }

  async function save(draft: TransactionDraft) {
    if (editing === "new") await repositories.transactions.add(draft)
    else if (editing) await repositories.transactions.update(editing.id, draft)
    setEditing(null)
  }

  if (!transactions) return <output>Loading transactions…</output>
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-muted-foreground">
            Search, filter, and maintain your locally stored activity.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden="true" /> Add transaction
        </Button>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null)
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
                <CardTitle id="transaction-form-title">
                  {editing === "new" ? "Add transaction" : `Edit ${editing.description}`}
                </CardTitle>
                <CardDescription>
                  Expenses use negative amounts; income and refunds use positive amounts.
                </CardDescription>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute top-4 right-4"
                  aria-label="Close transaction form"
                  onClick={() => setEditing(null)}
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <TransactionForm
                  key={editing === "new" ? "new" : editing.id}
                  {...(editing === "new" ? {} : { transaction: editing })}
                  groups={groups}
                  onSubmit={save}
                  onCancel={() => setEditing(null)}
                />
              </CardContent>
            </Card>
          </dialog>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter choices are saved in the page URL.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="transaction-search">Search</Label>
            <Input
              id="transaction-search"
              type="search"
              placeholder="Description, category, account, provider, or notes"
              value={filters.search}
              onChange={(event) => patchFilter({ search: event.target.value })}
            />
          </div>
          {(
            [
              ["category", "Category", unique(transactions, "category")],
              ["account", "Account", unique(transactions, "accountName")],
              ["provider", "Provider", unique(transactions, "provider")],
              ["transactionType", "Transaction type", unique(transactions, "transactionType")],
            ] as const
          ).map(([key, label, options]) => (
            <div className="grid gap-1.5" key={key}>
              <Label htmlFor={`filter-${key}`}>{label}</Label>
              <select
                id={`filter-${key}`}
                className={selectClass}
                value={filters[key]}
                onChange={(event) => patchFilter({ [key]: event.target.value })}
              >
                <option value="">All</option>
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="filter-group">Group</Label>
            <select
              id="filter-group"
              className={selectClass}
              value={filters.group}
              onChange={(event) => patchFilter({ group: event.target.value })}
            >
              <option value="">All</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="transaction-sort">Sort</Label>
            <select
              id="transaction-sort"
              className={selectClass}
              value={filters.sort}
              onChange={(event) => {
                if (isTransactionSort(event.target.value)) patchFilter({ sort: event.target.value })
              }}
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="amount-desc">Amount: high to low</option>
              <option value="amount-asc">Amount: low to high</option>
              <option value="description">Description</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" onClick={() => setFilters(defaultTransactionFilters)}>
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card aria-label="Bulk actions">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              {selected.size} selected
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-group">Add to group</Label>
              <select
                id="bulk-group"
                className={`${selectClass} w-44`}
                value=""
                onChange={(event) => {
                  if (event.target.value) void bulkApply({ groupId: event.target.value })
                }}
              >
                <option value="">Choose group…</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={() => void bulkApply({ groupId: null })}>
              Remove from group
            </Button>
            <Button
              variant="outline"
              onClick={() => void bulkApply({ shared: true, shareCount: DEFAULT_SHARE_COUNT })}
            >
              Mark shared ÷2
            </Button>
            <div className="flex items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="bulk-split">Split</Label>
                <Input
                  id="bulk-split"
                  type="number"
                  min={2}
                  max={10}
                  step={1}
                  className="w-20"
                  value={bulkSplit}
                  onChange={(event) => setBulkSplit(event.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const parsed = Number(bulkSplit)
                  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 10) return
                  void bulkApply({ shared: true, shareCount: parsed })
                }}
              >
                Apply split
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => void bulkApply({ shared: false, shareCount: DEFAULT_SHARE_COUNT })}
            >
              Unmark shared
            </Button>
            <Button
              variant="ghost"
              aria-label="Clear selection"
              onClick={() => setSelected(new Set())}
            >
              <X className="size-4" aria-hidden="true" /> Clear
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription aria-live="polite">
            Showing {pageRows.length} of {visible.length} matching transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="font-medium">No matching transactions</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adjust the filters, add a transaction, or import a CSV file.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm md:min-w-3xl">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 md:p-3">
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={allPageSelected}
                        onChange={(event) => toggleSelectAll(event.target.checked)}
                      />
                    </th>
                    <th className="p-2 md:p-3">Date</th>
                    <th className="p-2 md:p-3">Description</th>
                    <th className="hidden p-3 sm:table-cell">Category</th>
                    <th className="hidden p-3 md:table-cell">Account</th>
                    <th className="hidden p-3 md:table-cell">Provider / type</th>
                    <th className="p-2 text-right md:p-3">Amount</th>
                    <th className="p-2 md:p-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageRows.map((transaction) => {
                    const group = transaction.groupId
                      ? groupsById.get(transaction.groupId)
                      : undefined
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
                      <tr
                        key={transaction.id}
                        className={selected.has(transaction.id) ? "bg-accent" : undefined}
                      >
                        <td className="p-2 md:p-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${transaction.description}`}
                            checked={selected.has(transaction.id)}
                            onChange={(event) => toggleRow(transaction.id, event.target.checked)}
                          />
                        </td>
                        <td className="p-2 text-xs whitespace-nowrap md:p-3 md:text-sm">
                          {transaction.date}
                        </td>
                        <th scope="row" className="p-2 font-medium md:p-3">
                          {transaction.description}
                          {(group || transaction.shared) && (
                            <span className="mt-1 flex flex-wrap items-center gap-1">
                              {group && (
                                <Badge variant="outline" className="max-w-40 truncate">
                                  {group.name}
                                </Badge>
                              )}
                              {transaction.shared && (
                                <Badge variant="secondary">shared ÷{transaction.shareCount}</Badge>
                              )}
                            </span>
                          )}
                        </th>
                        <td className="hidden p-3 sm:table-cell">
                          {transaction.category ?? (
                            <span className="text-muted-foreground">Uncategorized</span>
                          )}
                        </td>
                        <td className="hidden p-3 md:table-cell">
                          <span className="block">{transaction.accountName ?? "—"}</span>
                          <span className="text-xs text-muted-foreground">
                            {transaction.accountType}
                          </span>
                        </td>
                        <td className="hidden p-3 md:table-cell">
                          <span className="block">{transaction.provider ?? "—"}</span>
                          {transaction.transactionType && (
                            <Badge variant="outline">{transaction.transactionType}</Badge>
                          )}
                        </td>
                        <td className="p-2 text-right text-xs font-medium tabular-nums md:p-3 md:text-sm">
                          {formatMoney(normalized)}
                          {effective !== normalized && (
                            <span className="block text-[11px] text-muted-foreground">
                              your share {formatMoney(effective)}
                            </span>
                          )}
                        </td>
                        <td className="p-1 md:p-3">
                          <div className="flex justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit ${transaction.description}`}
                              onClick={() => setEditing(transaction)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete ${transaction.description}`}
                              onClick={() => setDeleting(transaction)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <nav
              aria-label="Transaction pages"
              className="mt-4 flex items-center justify-end gap-3"
            >
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </CardContent>
      </Card>

      {deleting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleting(null)
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
                  This permanently removes {deleting.description} from this browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={() => setDeleting(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    void repositories.transactions.remove(deleting.id).then(() => setDeleting(null))
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
