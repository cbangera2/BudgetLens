import { useLiveQuery } from "dexie-react-hooks"
import { Pencil, Plus, Trash2, Users, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { repositories } from "@/db/repositories"
import type { Transaction, TransactionDraft } from "@/domain/models"
import { DEFAULT_SHARE_COUNT, effectiveTransactionAmountMinor } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { formatMoney } from "@/features/dashboard/format"
import { cn } from "@/lib/cn"

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
  const groups = useMemo(() => data?.[1] ?? [], [data])
  const [filters, setFilters] = useState(() => parseTransactionFilters(location.search))
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Transaction | "new" | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [lastSplit, setLastSplit] = useState(DEFAULT_SHARE_COUNT)
  const lastSelectedRef = useRef<string | null>(null)

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

  const categoryClickTimeoutRef = useRef<number | null>(null)

  function handleCategoryClick(category: string) {
    if (categoryClickTimeoutRef.current) window.clearTimeout(categoryClickTimeoutRef.current)
    categoryClickTimeoutRef.current = window.setTimeout(() => {
      setFilters((current) => {
        const isIncluded = current.categories.includes(category)
        const isExcluded = current.excludedCategories.includes(category)
        if (isIncluded) {
          // Included → move to excluded (cycle)
          return {
            ...current,
            categories: current.categories.filter((value) => value !== category),
            excludedCategories: [...current.excludedCategories, category],
          }
        }
        if (isExcluded) {
          // Excluded → clear
          return {
            ...current,
            excludedCategories: current.excludedCategories.filter((value) => value !== category),
          }
        }
        // Not selected → include
        return { ...current, categories: [...current.categories, category] }
      })
    }, 320)
  }

  function handleCategoryDoubleClick(category: string, event: React.MouseEvent) {
    event.preventDefault()
    if (categoryClickTimeoutRef.current) window.clearTimeout(categoryClickTimeoutRef.current)
    setFilters((current) => {
      const isExcluded = current.excludedCategories.includes(category)
      const isIncluded = current.categories.includes(category)
      if (isExcluded) {
        return {
          ...current,
          excludedCategories: current.excludedCategories.filter((value) => value !== category),
        }
      }
      if (isIncluded) {
        return {
          ...current,
          categories: current.categories.filter((value) => value !== category),
          excludedCategories: [...current.excludedCategories, category],
        }
      }
      return { ...current, excludedCategories: [...current.excludedCategories, category] }
    })
  }

  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])

  function toggleRow(
    id: string,
    checked: boolean,
    event?: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
  ) {
    const shift = Boolean(
      event &&
      "shiftKey" in event &&
      (event as { shiftKey: boolean }).shiftKey &&
      lastSelectedRef.current,
    )
    if (shift) {
      const lastId = lastSelectedRef.current!
      const lastIndex = visible.findIndex((row) => row.id === lastId)
      const currentIndex = visible.findIndex((row) => row.id === id)
      if (lastIndex !== -1 && currentIndex !== -1) {
        const [start, end] = [Math.min(lastIndex, currentIndex), Math.max(lastIndex, currentIndex)]
        const rangeIds = visible.slice(start, end + 1).map((row) => row.id)
        setSelected((current) => {
          const next = new Set(current)
          for (const rangeId of rangeIds) {
            if (checked) next.add(rangeId)
            else next.delete(rangeId)
          }
          return next
        })
        lastSelectedRef.current = id
        return
      }
    }
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
    lastSelectedRef.current = id
  }

  const pageSelection = pageRows.filter((row) => selected.has(row.id))
  const allPageSelected = pageRows.length > 0 && pageSelection.length === pageRows.length
  const selectedVisibleCount = useMemo(
    () => visible.filter((row) => selected.has(row.id)).length,
    [visible, selected],
  )
  const allVisibleSelected = visible.length > 0 && selectedVisibleCount === visible.length
  function toggleSelectAll(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const row of pageRows) {
        if (checked) next.add(row.id)
        else next.delete(row.id)
      }
      return next
    })
    if (checked && pageRows[0]) lastSelectedRef.current = pageRows[0].id
  }

  function toggleSelectAllMatching(checked: boolean) {
    if (checked) setSelected(new Set(visible.map((row) => row.id)))
    else setSelected(new Set())
    if (checked && visible[0]) lastSelectedRef.current = visible[0].id
  }

  function handleRowClick(event: React.MouseEvent, id: string) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, a, input, select, label")
    )
      return
    const checked = !selected.has(id)
    toggleRow(id, checked, event)
  }

  async function bulkApply(changes: Partial<TransactionDraft>) {
    await repositories.transactions.updateMany([...selected], changes)
    if (changes.shareCount && Number.isInteger(changes.shareCount)) {
      setLastSplit(changes.shareCount)
    }
    setSelected(new Set())
  }

  async function toggleSharedSingle(transaction: Transaction, checked: boolean) {
    await repositories.transactions.update(transaction.id, {
      shared: checked,
      shareCount: checked ? (transaction.shareCount ?? lastSplit) : DEFAULT_SHARE_COUNT,
    })
    if (checked) setLastSplit(transaction.shareCount ?? lastSplit)
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
                  fieldOptions={{
                    category: unique(transactions, "category"),
                    transactionType: unique(transactions, "transactionType"),
                    accountName: unique(transactions, "accountName"),
                    accountType: unique(transactions, "accountType"),
                    provider: unique(transactions, "provider"),
                  }}
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
          <div className="grid gap-1.5 sm:col-span-2 xl:col-span-3">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-1.5">
              {unique(transactions, "category").map((category) => {
                const isIncluded = filters.categories.includes(category)
                const isExcluded = filters.excludedCategories.includes(category)
                return (
                  <button
                    key={category}
                    type="button"
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                      isExcluded
                        ? "border-transparent bg-secondary text-secondary-foreground line-through opacity-60"
                        : isIncluded
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "text-foreground",
                      "cursor-pointer select-none",
                    )}
                    onClick={() => handleCategoryClick(category)}
                    onDoubleClick={(event) => handleCategoryDoubleClick(category, event)}
                  >
                    {category}
                  </button>
                )
              })}
              {unique(transactions, "category").length === 0 && (
                <span className="text-xs text-muted-foreground">No categories</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Click to cycle: include → exclude → clear. Double-click to exclude directly.
            </p>
          </div>
          {(
            [
              ["account", "Account", unique(transactions, "accountName")],
              ["provider", "Provider", unique(transactions, "provider")],
              ["transactionType", "Transaction type", unique(transactions, "transactionType")],
            ] as const
          ).map(([key, label, options]) => (
            <div className="grid gap-1.5" key={key}>
              <Label htmlFor={`filter-${key}`}>{label}</Label>
              <Select
                id={`filter-${key}`}
                aria-label={label}
                value={filters[key] || "__all__"}
                onValueChange={(value) => patchFilter({ [key]: value === "__all__" ? "" : value })}
                options={[
                  { value: "__all__", label: "All" },
                  ...options.map((option) => ({ value: option, label: option })),
                ]}
              />
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="filter-group">Group</Label>
            <Select
              id="filter-group"
              aria-label="Group"
              value={filters.group || "__all__"}
              onValueChange={(value) => patchFilter({ group: value === "__all__" ? "" : value })}
              options={[
                { value: "__all__", label: "All" },
                ...groups.map((group) => ({ value: group.id, label: group.name })),
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="transaction-sort">Sort</Label>
            <Select
              id="transaction-sort"
              aria-label="Sort"
              value={filters.sort}
              onValueChange={(value) => {
                if (isTransactionSort(value)) patchFilter({ sort: value })
              }}
              options={[
                { value: "date-desc", label: "Newest first" },
                { value: "date-asc", label: "Oldest first" },
                { value: "amount-desc", label: "Amount: high to low" },
                { value: "amount-asc", label: "Amount: low to high" },
                { value: "description", label: "Description" },
              ]}
            />
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
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              {selectedVisibleCount} of {visible.length} selected
              {selected.size !== selectedVisibleCount ? ` (${selected.size} total)` : ""}
            </span>
            <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <Select
                id="bulk-group"
                aria-label="Add to group"
                value=""
                onValueChange={(value) => {
                  if (value) void bulkApply({ groupId: value })
                }}
                options={[
                  { value: "__placeholder__", label: "Add to group…", disabled: true },
                  ...groups.map((group) => ({ value: group.id, label: group.name })),
                ]}
                placeholder="Add to group…"
                className="h-9 w-44"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void bulkApply({ groupId: null })}
                aria-label="Remove from group"
              >
                Remove
              </Button>
            </div>
            <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <Select
                id="bulk-share"
                aria-label="Sharing"
                value=""
                onValueChange={(value) => {
                  if (!value || value === "__placeholder__") return
                  if (value === "off") {
                    void bulkApply({ shared: false, shareCount: DEFAULT_SHARE_COUNT })
                  } else {
                    const split = Number(value)
                    if (Number.isInteger(split) && split >= 2 && split <= 10) {
                      setLastSplit(split)
                      void bulkApply({ shared: true, shareCount: split })
                    }
                  }
                }}
                options={[
                  { value: "__placeholder__", label: "Sharing…", disabled: true },
                  { value: "off", label: "Not shared" },
                  { value: "2", label: `Shared ÷2${lastSplit === 2 ? " •" : ""}` },
                  { value: "3", label: `Shared ÷3${lastSplit === 3 ? " •" : ""}` },
                  { value: "4", label: `Shared ÷4${lastSplit === 4 ? " •" : ""}` },
                  { value: "5", label: `Shared ÷5${lastSplit === 5 ? " •" : ""}` },
                  { value: "6", label: `Shared ÷6${lastSplit === 6 ? " •" : ""}` },
                  { value: "10", label: `Shared ÷10${lastSplit === 10 ? " •" : ""}` },
                ]}
                placeholder="Sharing…"
                className="h-9 w-36"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
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
            {selected.size > 0 && !allVisibleSelected && visible.length > pageSize && (
              <button
                type="button"
                className="ml-2 text-primary underline"
                onClick={() => toggleSelectAllMatching(true)}
              >
                Select all {visible.length} matching
              </button>
            )}
            {allVisibleSelected && visible.length > pageSize && (
              <button
                type="button"
                className="ml-2 text-primary underline"
                onClick={() => toggleSelectAllMatching(false)}
              >
                Clear selection
              </button>
            )}
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
                    <th className="p-1 sm:p-2 md:p-3">
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
                    <th className="hidden p-2 text-center sm:table-cell md:p-3">Shared</th>
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
                        className={
                          (selected.has(transaction.id) ? "bg-accent " : "") +
                          "cursor-pointer hover:bg-muted/50"
                        }
                        onClick={(event) => handleRowClick(event, transaction.id)}
                      >
                        <td className="p-1 sm:p-2 md:p-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${transaction.description}`}
                            checked={selected.has(transaction.id)}
                            onChange={(event) =>
                              toggleRow(transaction.id, event.target.checked, event)
                            }
                            onClick={(event) => event.stopPropagation()}
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
                          {transaction.provider ? (
                            <span className="block">{transaction.provider}</span>
                          ) : transaction.transactionType ? null : (
                            <span className="block text-muted-foreground">—</span>
                          )}
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
                        <td className="hidden p-2 text-center sm:table-cell md:p-3">
                          <input
                            type="checkbox"
                            aria-label={`Mark ${transaction.description} shared`}
                            checked={transaction.shared}
                            onChange={(event) => {
                              event.stopPropagation()
                              void toggleSharedSingle(transaction, event.target.checked)
                            }}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td className="p-1 md:p-3">
                          <div className="flex justify-end gap-1">
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
