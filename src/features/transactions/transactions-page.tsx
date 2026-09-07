import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IncludeExcludeFilter } from "@/components/ui/include-exclude-filter"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { repositories } from "@/db/repositories"
import type { Transaction, TransactionDraft } from "@/domain/models"
import { DEFAULT_SHARE_COUNT, effectiveTransactionAmountMinor } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { formatMoney } from "@/features/dashboard/format"
import { deleteTransactionReceipts } from "@/features/receipts/receipts"
import { readReceiptSidecar } from "@/features/receipts/sidecar"
import { detectTransferPairs, transferPairIds } from "@/features/transfers/detection"
import { useTransferFlags } from "@/features/transfers/store"
import { TransferBadge, TransfersSection } from "@/features/transfers/transfers-section"
import { notifyDeletedWithUndo, toastDeleteFailed } from "@/lib/undo-buffer"

import { DatePresetChips } from "./date-preset-chips"
import {
  defaultTransactionFilters,
  filterAndSortTransactions,
  isTransactionSort,
  parseTransactionFilters,
  serializeTransactionFilters,
  type TransactionViewFilters,
} from "./filtering"
import { SavedViewsBar } from "./saved-views-bar"
import { SearchHintChips } from "./search-hint-chips"
import { TransactionForm } from "./transaction-form"
import {
  areReceiptCountsEqual,
  clampPage,
  computeRunningBalances,
  formatRelativeDate,
  nextColumnSort,
  shouldIgnoreRowClick,
  sortTransactionsByColumn,
  type TransactionColumnKey,
  type TransactionColumnSortState,
} from "./transaction-list-utils"

const pageSize = 50

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
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [columnSort, setColumnSort] = useState<TransactionColumnSortState>(null)
  const [receiptCounts, setReceiptCounts] = useState<ReadonlyMap<string, number>>(
    () =>
      new Map(Object.entries(readReceiptSidecar()).map(([id, refs]) => [id, refs.length] as const)),
  )
  const [lastSplit, setLastSplit] = useState(DEFAULT_SHARE_COUNT)
  const lastSelectedRef = useRef<string | null>(null)
  const editingTriggerRef = useRef<HTMLElement | null>(null)
  const editingWasOpenRef = useRef(false)
  const deletingTriggerRef = useRef<HTMLElement | null>(null)
  const deletingWasOpenRef = useRef(false)
  useReturnFocusOnClose(editing !== null, editingTriggerRef, editingWasOpenRef)
  useReturnFocusOnClose(deleting !== null, deletingTriggerRef, deletingWasOpenRef)

  useEffect(() => {
    const refreshReceipts = () => {
      const next = new Map(
        Object.entries(readReceiptSidecar()).map(([id, refs]) => [id, refs.length] as const),
      )
      // Keep the previous state when nothing changed so the interval tick
      // does not re-render the table every two seconds.
      setReceiptCounts((current) => (areReceiptCountsEqual(current, next) ? current : next))
    }
    refreshReceipts()
    window.addEventListener("storage", refreshReceipts)
    window.addEventListener("focus", refreshReceipts)
    const timer = window.setInterval(refreshReceipts, 2000)
    return () => {
      window.removeEventListener("storage", refreshReceipts)
      window.removeEventListener("focus", refreshReceipts)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const query = serializeTransactionFilters(filters)
    history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}`)
    setPage(1)
  }, [filters])

  useEffect(() => {
    if (!editing && !deleting && !bulkDeleting) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (bulkDeleting) setBulkDeleting(false)
      else if (deleting) setDeleting(null)
      else setEditing(null)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [bulkDeleting, deleting, editing])

  const visible = useMemo(
    () => filterAndSortTransactions(transactions ?? [], filters),
    [transactions, filters],
  )
  const ordered = useMemo(
    () => sortTransactionsByColumn(visible, columnSort),
    [visible, columnSort],
  )
  const balances = useMemo(() => computeRunningBalances(transactions ?? []), [transactions])
  const categoryOptions = useMemo(() => unique(transactions ?? [], "category"), [transactions])
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize))
  const pageRows = ordered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    // A bulk delete can empty the final page while page still points past
    // it; without clamping the table goes blank with no pager to recover.
    setPage((current) => clampPage(current, pages))
  }, [pages])
  const patchFilter = (patch: Partial<TransactionViewFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))

  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const transferFlags = useTransferFlags()
  const flaggedTransferIds = useMemo(() => {
    const pairs = detectTransferPairs(transactions ?? [])
    const ids = transferPairIds(pairs)
    return new Set([...ids].filter((id) => !transferFlags.dismissedIds.has(id)))
  }, [transactions, transferFlags.dismissedIds])

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
      const lastIndex = ordered.findIndex((row) => row.id === lastId)
      const currentIndex = ordered.findIndex((row) => row.id === id)
      if (lastIndex !== -1 && currentIndex !== -1) {
        const [start, end] = [Math.min(lastIndex, currentIndex), Math.max(lastIndex, currentIndex)]
        const rangeIds = ordered.slice(start, end + 1).map((row) => row.id)
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
    if (shouldIgnoreRowClick(event.target)) return
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

  async function bulkRemove() {
    const ids = [...selected]
    const byId = new Map((transactions ?? []).map((row) => [row.id, row]))
    const removed: Transaction[] = []
    let failed = false
    for (const id of ids) {
      const snapshot = byId.get(id)
      try {
        // oxlint-disable-next-line no-await-in-loop -- Deterministic removal order.
        await repositories.transactions.remove(id)
      } catch {
        // A missing row is already gone; keep removing the rest.
        failed = true
        continue
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Per-row receipt cleanup.
        await deleteTransactionReceipts(id)
      } catch {
        // Receipt cleanup is best-effort and never blocks bulk delete.
      }
      if (snapshot) removed.push(snapshot)
    }
    setSelected((current) => {
      const next = new Set(current)
      for (const row of removed) next.delete(row.id)
      return next
    })
    if (failed) {
      // Matches the single-delete failure contract: keep the dialog open and
      // report, so the remaining selection can be retried.
      toastDeleteFailed("Transactions")
      return
    }
    setBulkDeleting(false)
    setSelected(new Set())
    const [single] = removed
    if (removed.length === 1 && single) {
      notifyDeletedWithUndo("Transaction", { kind: "transaction", transaction: single })
    }
  }

  function sortButtonLabel(key: TransactionColumnKey, label: string): string {
    if (!columnSort || columnSort.key !== key) return `Sort by ${label}`
    return columnSort.direction === "asc"
      ? `Sort by ${label}, currently ascending`
      : `Sort by ${label}, currently descending`
  }

  // Sort direction icons stay hidden below the md breakpoint: even a 12px
  // icon per header adds enough table min-content to push this already-wide
  // page past the mobile layout viewport and break dialog hit-testing.
  function sortIcon(key: TransactionColumnKey) {
    const className = "hidden size-3 md:inline-flex"
    if (!columnSort || columnSort.key !== key) {
      return <ArrowUpDown className={className} aria-hidden="true" />
    }
    return columnSort.direction === "asc" ? (
      <ArrowUp className={className} aria-hidden="true" />
    ) : (
      <ArrowDown className={className} aria-hidden="true" />
    )
  }

  // Active-column styling uses underline variants only: they add no width,
  // so the table keeps its baseline min-content on narrow viewports.
  function sortButtonClassName(key: TransactionColumnKey): string {
    if (!columnSort || columnSort.key !== key) {
      return "inline-flex items-center gap-1 font-medium hover:text-foreground"
    }
    const decoration = columnSort.direction === "asc" ? "decoration-solid" : "decoration-dotted"
    return `inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 ${decoration} hover:text-foreground`
  }

  function ariaSortFor(key: TransactionColumnKey): "ascending" | "descending" | "none" {
    if (!columnSort || columnSort.key !== key) return "none"
    return columnSort.direction === "asc" ? "ascending" : "descending"
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
            <SearchHintChips search={filters.search} />
          </div>
          <DatePresetChips
            from={filters.from}
            to={filters.to}
            onChange={(range) => patchFilter(range)}
          />
          <SavedViewsBar filters={filters} onApply={setFilters} />
          <IncludeExcludeFilter
            label="Merchant"
            options={unique(transactions, "description")}
            included={filters.merchants}
            excluded={filters.excludedMerchants}
            onIncludedChange={(next) =>
              setFilters((current) => ({ ...current, merchants: next, merchant: "" }))
            }
            onExcludedChange={(next) =>
              setFilters((current) => ({ ...current, excludedMerchants: next }))
            }
          />
          <IncludeExcludeFilter
            label="Category"
            options={unique(transactions, "category")}
            included={filters.categories}
            excluded={filters.excludedCategories}
            onIncludedChange={(next) =>
              setFilters((current) => ({ ...current, categories: next, category: "" }))
            }
            onExcludedChange={(next) =>
              setFilters((current) => ({ ...current, excludedCategories: next }))
            }
          />
          <IncludeExcludeFilter
            label="Account"
            options={unique(transactions, "accountName")}
            included={filters.accounts}
            excluded={filters.excludedAccounts}
            onIncludedChange={(next) =>
              setFilters((current) => ({ ...current, accounts: next, account: "" }))
            }
            onExcludedChange={(next) =>
              setFilters((current) => ({ ...current, excludedAccounts: next }))
            }
          />
          <IncludeExcludeFilter
            label="Provider"
            options={unique(transactions, "provider")}
            included={filters.providers}
            excluded={filters.excludedProviders}
            onIncludedChange={(next) =>
              setFilters((current) => ({ ...current, providers: next, provider: "" }))
            }
            onExcludedChange={(next) =>
              setFilters((current) => ({ ...current, excludedProviders: next }))
            }
          />
          <IncludeExcludeFilter
            label="Transaction type"
            options={unique(transactions, "transactionType")}
            included={filters.transactionTypes}
            excluded={filters.excludedTransactionTypes}
            onIncludedChange={(next) =>
              setFilters((current) => ({ ...current, transactionTypes: next, transactionType: "" }))
            }
            onExcludedChange={(next) =>
              setFilters((current) => ({ ...current, excludedTransactionTypes: next }))
            }
          />
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
                id="bulk-category"
                aria-label="Recategorize"
                value=""
                onValueChange={(value) => {
                  if (!value || value === "__placeholder__") return
                  if (value === "__uncategorized__") void bulkApply({ category: null })
                  else void bulkApply({ category: value })
                }}
                options={[
                  { value: "__placeholder__", label: "Recategorize…", disabled: true },
                  ...categoryOptions.map((category) => ({ value: category, label: category })),
                  { value: "__uncategorized__", label: "Uncategorized" },
                ]}
                placeholder="Recategorize…"
                className="h-9 w-44"
              />
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
              aria-label="Delete selected"
              onClick={() => setBulkDeleting(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" /> Delete
            </Button>
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

      <TransfersSection transactions={transactions} flagActions={transferFlags} />

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
                Adjust the filters, add a transaction, or{" "}
                <Link to="/imports" className="text-primary underline underline-offset-4">
                  upload a CSV file
                </Link>
                .
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
                    <th className="p-2 md:p-3" aria-sort={ariaSortFor("date")}>
                      <button
                        type="button"
                        aria-label={sortButtonLabel("date", "date")}
                        onClick={() => setColumnSort(nextColumnSort(columnSort, "date"))}
                        className={sortButtonClassName("date")}
                      >
                        Date {sortIcon("date")}
                      </button>
                    </th>
                    <th className="p-2 md:p-3" aria-sort={ariaSortFor("merchant")}>
                      <button
                        type="button"
                        aria-label={sortButtonLabel("merchant", "merchant")}
                        onClick={() => setColumnSort(nextColumnSort(columnSort, "merchant"))}
                        className={sortButtonClassName("merchant")}
                      >
                        Description {sortIcon("merchant")}
                      </button>
                    </th>
                    <th className="hidden p-3 sm:table-cell">Category</th>
                    <th className="hidden p-3 md:table-cell">Account</th>
                    <th className="hidden p-3 md:table-cell">Provider / type</th>
                    <th className="p-2 text-right md:p-3" aria-sort={ariaSortFor("amount")}>
                      <button
                        type="button"
                        aria-label={sortButtonLabel("amount", "amount")}
                        onClick={() => setColumnSort(nextColumnSort(columnSort, "amount"))}
                        className={sortButtonClassName("amount")}
                      >
                        Amount {sortIcon("amount")}
                      </button>
                    </th>
                    <th className="hidden p-3 text-right md:table-cell">Balance</th>
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
                          <span className="block">{transaction.date}</span>
                          {formatRelativeDate(transaction.date) && (
                            <span className="block text-[11px] text-muted-foreground">
                              {formatRelativeDate(transaction.date)}
                            </span>
                          )}
                        </td>
                        <th scope="row" className="p-2 font-medium md:p-3">
                          <Link
                            to="/transactions/$transactionId"
                            params={{ transactionId: transaction.id }}
                            className="underline-offset-4 hover:underline"
                          >
                            {transaction.description}
                          </Link>
                          {(group ||
                            transaction.shared ||
                            flaggedTransferIds.has(transaction.id) ||
                            receiptCounts.has(transaction.id)) && (
                            <span className="mt-1 flex flex-wrap items-center gap-1">
                              {group && (
                                <Link
                                  to="/groups/$groupId"
                                  params={{ groupId: group.id }}
                                  className="max-w-40 truncate"
                                >
                                  <Badge variant="outline" className="max-w-40 truncate">
                                    {group.name}
                                  </Badge>
                                </Link>
                              )}
                              {transaction.shared && (
                                <Badge variant="secondary">shared ÷{transaction.shareCount}</Badge>
                              )}
                              {flaggedTransferIds.has(transaction.id) && <TransferBadge />}
                              {receiptCounts.has(transaction.id) && (
                                <Link
                                  to="/transactions/$transactionId"
                                  params={{ transactionId: transaction.id }}
                                  aria-label={`View receipt for ${transaction.description}`}
                                  className="inline-flex"
                                >
                                  <Badge
                                    variant="outline"
                                    className="inline-flex items-center gap-1"
                                  >
                                    <Receipt className="size-3" aria-hidden="true" />
                                    {(receiptCounts.get(transaction.id) ?? 1) > 1
                                      ? `${receiptCounts.get(transaction.id)} receipts`
                                      : "Receipt"}
                                  </Badge>
                                </Link>
                              )}
                            </span>
                          )}
                        </th>
                        <td className="hidden p-3 sm:table-cell">
                          {transaction.category ? (
                            <button
                              type="button"
                              className="text-primary underline-offset-4 hover:underline"
                              onClick={() => {
                                const value = transaction.category
                                if (value)
                                  setFilters((current) => ({
                                    ...current,
                                    categories: [value],
                                    category: value,
                                  }))
                              }}
                            >
                              {transaction.category}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">Uncategorized</span>
                          )}
                        </td>
                        <td className="hidden p-3 md:table-cell">
                          {transaction.accountName ? (
                            <button
                              type="button"
                              className="block text-primary underline-offset-4 hover:underline"
                              onClick={() => {
                                const value = transaction.accountName
                                if (value)
                                  setFilters((current) => ({
                                    ...current,
                                    accounts: [value],
                                    account: value,
                                  }))
                              }}
                            >
                              {transaction.accountName}
                            </button>
                          ) : (
                            <span className="block">—</span>
                          )}
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
                        <td className="hidden p-3 text-right text-xs tabular-nums md:table-cell md:text-sm">
                          <span
                            title={`Running balance for ${transaction.accountName ?? "unspecified account"}`}
                          >
                            {formatMoney(balances.get(transaction.id) ?? normalized)}
                          </span>
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
                    const snapshot = deleting
                    void (async () => {
                      try {
                        await repositories.transactions.remove(snapshot.id)
                      } catch {
                        toastDeleteFailed("Transaction")
                        return
                      }
                      setDeleting(null)
                      notifyDeletedWithUndo("Transaction", {
                        kind: "transaction",
                        transaction: snapshot,
                      })
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
      {bulkDeleting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBulkDeleting(false)
          }}
        >
          <dialog
            open
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
            aria-describedby="bulk-delete-description"
            className="relative m-0 w-full max-w-md rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle id="bulk-delete-title">
                  Delete {selected.size} transaction{selected.size === 1 ? "" : "s"}?
                </CardTitle>
                <CardDescription id="bulk-delete-description">
                  This permanently removes {selected.size} selected transaction
                  {selected.size === 1 ? "" : "s"} from this browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button variant="ghost" autoFocus onClick={() => setBulkDeleting(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void bulkRemove()}>
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
