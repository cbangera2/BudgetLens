import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { IncludeExcludeFilter } from "@/components/ui/include-exclude-filter"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/cn"

import { DatePresetChips } from "./date-preset-chips"
import type { TransactionViewFilters } from "./filtering"
import { isTransactionSort } from "./filtering"
import { SavedViewsBar } from "./saved-views-bar"
import { SearchHintChips } from "./search-hint-chips"

export interface TransactionFilterBarGroups {
  id: string
  name: string
}

interface TransactionFilterBarProps {
  filters: TransactionViewFilters
  groups: readonly TransactionFilterBarGroups[]
  merchantOptions: readonly string[]
  categoryOptions: readonly string[]
  accountOptions: readonly string[]
  providerOptions: readonly string[]
  transactionTypeOptions: readonly string[]
  onPatch: (patch: Partial<TransactionViewFilters>) => void
  onApply: (filters: TransactionViewFilters) => void
  onReset: () => void
}

/**
 * Progressive-disclosure wrapper for the Transactions filter controls.
 *
 * The essentials (search box, date presets, disclosure toggle) stay visible;
 * operator hints, saved views, and every facet select live behind the
 * "More filters" disclosure. Open state is session-only React state on
 * purpose: it survives filter interactions within the session but resets on
 * reload instead of persisting. Filtering behavior itself is untouched — this
 * component only reorganizes presentation and forwards patches.
 */
export function TransactionFilterBar({
  filters,
  groups,
  merchantOptions,
  categoryOptions,
  accountOptions,
  providerOptions,
  transactionTypeOptions,
  onPatch,
  onApply,
  onReset,
}: TransactionFilterBarProps) {
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="grid min-w-52 flex-1 gap-1.5">
          <Label htmlFor="transaction-search">Search</Label>
          <Input
            id="transaction-search"
            type="search"
            placeholder="Description, category, account, provider, or notes"
            value={filters.search}
            onChange={(event) => onPatch({ search: event.target.value })}
          />
        </div>
        <DatePresetChips from={filters.from} to={filters.to} onChange={(range) => onPatch(range)} />
        <div className="ms-auto">
          <Button
            type="button"
            variant="outline"
            aria-expanded={moreFiltersOpen}
            aria-controls="more-filters"
            onClick={() => setMoreFiltersOpen((open) => !open)}
          >
            {moreFiltersOpen ? "Fewer filters" : "More filters"}
            <ChevronDown
              className={cn("size-4 transition-transform", moreFiltersOpen && "rotate-180")}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {moreFiltersOpen && (
        <div id="more-filters" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="sm:col-span-2 xl:col-span-3">
            <SearchHintChips search={filters.search} />
          </div>
          <SavedViewsBar filters={filters} onApply={onApply} />
          <IncludeExcludeFilter
            label="Merchant"
            options={merchantOptions}
            included={filters.merchants}
            excluded={filters.excludedMerchants}
            onIncludedChange={(next) => onPatch({ merchants: next, merchant: "" })}
            onExcludedChange={(next) => onPatch({ excludedMerchants: next })}
          />
          <IncludeExcludeFilter
            label="Category"
            options={categoryOptions}
            included={filters.categories}
            excluded={filters.excludedCategories}
            onIncludedChange={(next) => onPatch({ categories: next, category: "" })}
            onExcludedChange={(next) => onPatch({ excludedCategories: next })}
          />
          <IncludeExcludeFilter
            label="Account"
            options={accountOptions}
            included={filters.accounts}
            excluded={filters.excludedAccounts}
            onIncludedChange={(next) => onPatch({ accounts: next, account: "" })}
            onExcludedChange={(next) => onPatch({ excludedAccounts: next })}
          />
          <IncludeExcludeFilter
            label="Provider"
            options={providerOptions}
            included={filters.providers}
            excluded={filters.excludedProviders}
            onIncludedChange={(next) => onPatch({ providers: next, provider: "" })}
            onExcludedChange={(next) => onPatch({ excludedProviders: next })}
          />
          <IncludeExcludeFilter
            label="Transaction type"
            options={transactionTypeOptions}
            included={filters.transactionTypes}
            excluded={filters.excludedTransactionTypes}
            onIncludedChange={(next) => onPatch({ transactionTypes: next, transactionType: "" })}
            onExcludedChange={(next) => onPatch({ excludedTransactionTypes: next })}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="filter-group">Group</Label>
            <Select
              id="filter-group"
              aria-label="Group"
              value={filters.group || "__all__"}
              onValueChange={(value) => onPatch({ group: value === "__all__" ? "" : value })}
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
                if (isTransactionSort(value)) onPatch({ sort: value })
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
            <Button variant="ghost" onClick={onReset}>
              Clear filters
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
