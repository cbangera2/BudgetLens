import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"

import { DATE_PRESETS, matchDatePreset } from "./date-presets"
import type { TransactionViewFilters } from "./filtering"

export interface ActiveFilterGroup {
  id: string
  name: string
}

interface ActiveFilter {
  key: string
  label: string
  clear: Partial<TransactionViewFilters>
}

const SORT_LABELS: Record<TransactionViewFilters["sort"], string> = {
  "date-desc": "Newest first",
  "date-asc": "Oldest first",
  "amount-desc": "Amount: high to low",
  "amount-asc": "Amount: low to high",
  description: "Description",
}

function dateLabel(filters: TransactionViewFilters): string | null {
  if (!filters.from && !filters.to) return null
  const preset = matchDatePreset(filters.from, filters.to)
  if (preset) return DATE_PRESETS.find((item) => item.id === preset)?.label ?? preset
  if (filters.from && filters.to) return `${filters.from} → ${filters.to}`
  if (filters.from) return `From ${filters.from}`
  return `Until ${filters.to}`
}

function listChips(
  label: string,
  field: "merchants" | "categories" | "accounts" | "providers" | "transactionTypes",
  excludedField:
    | "excludedMerchants"
    | "excludedCategories"
    | "excludedAccounts"
    | "excludedProviders"
    | "excludedTransactionTypes",
  filters: TransactionViewFilters,
): ActiveFilter[] {
  const chips: ActiveFilter[] = []
  for (const value of filters[field]) {
    chips.push({
      key: `${field}:${value}`,
      label: `${label}: ${value}`,
      clear: { [field]: filters[field].filter((item) => item !== value) },
    })
  }
  for (const value of filters[excludedField]) {
    chips.push({
      key: `${excludedField}:${value}`,
      label: `${label} ≠ ${value}`,
      clear: {
        [excludedField]: filters[excludedField].filter((item) => item !== value),
      },
    })
  }
  return chips
}

/** Flat list of every active filter for chips + counts. Exported for tests. */
export function activeFilters(
  filters: TransactionViewFilters,
  groups: readonly ActiveFilterGroup[],
): ActiveFilter[] {
  const chips: ActiveFilter[] = []
  if (filters.search.trim()) {
    chips.push({ key: "search", label: `Search: ${filters.search.trim()}`, clear: { search: "" } })
  }
  const date = dateLabel(filters)
  if (date) chips.push({ key: "date", label: `Date: ${date}`, clear: { from: "", to: "" } })
  if (filters.merchant.trim()) {
    chips.push({
      key: "merchant",
      label: `Merchant: ${filters.merchant.trim()}`,
      clear: { merchant: "" },
    })
  }
  if (filters.category.trim()) {
    chips.push({
      key: "category",
      label: `Category: ${filters.category.trim()}`,
      clear: { category: "" },
    })
  }
  if (filters.account.trim()) {
    chips.push({
      key: "account",
      label: `Account: ${filters.account.trim()}`,
      clear: { account: "" },
    })
  }
  if (filters.provider.trim()) {
    chips.push({
      key: "provider",
      label: `Provider: ${filters.provider.trim()}`,
      clear: { provider: "" },
    })
  }
  if (filters.transactionType.trim()) {
    chips.push({
      key: "transactionType",
      label: `Type: ${filters.transactionType.trim()}`,
      clear: { transactionType: "" },
    })
  }
  chips.push(...listChips("Merchant", "merchants", "excludedMerchants", filters))
  chips.push(...listChips("Category", "categories", "excludedCategories", filters))
  chips.push(...listChips("Account", "accounts", "excludedAccounts", filters))
  chips.push(...listChips("Provider", "providers", "excludedProviders", filters))
  chips.push(...listChips("Type", "transactionTypes", "excludedTransactionTypes", filters))
  if (filters.group) {
    const name = groups.find((group) => group.id === filters.group)?.name ?? filters.group
    chips.push({ key: "group", label: `Group: ${name}`, clear: { group: "" } })
  }
  if (filters.importBatch) {
    chips.push({
      key: "importBatch",
      label: `Import: ${filters.importBatch.slice(0, 8)}…`,
      clear: { importBatch: "" },
    })
  }
  if (filters.sort !== "date-desc") {
    chips.push({
      key: "sort",
      label: `Sort: ${SORT_LABELS[filters.sort]}`,
      clear: { sort: "date-desc" },
    })
  }
  return chips
}

interface ActiveFilterChipsProps {
  filters: TransactionViewFilters
  groups: readonly ActiveFilterGroup[]
  onRemove: (patch: Partial<TransactionViewFilters>) => void
  onClear: () => void
}

/**
 * At-a-glance summary of applied filters. Renders nothing when filters match
 * the defaults, so deep links (every filter lives in the URL) are readable
 * without expanding the Filters card. Each chip removes just its own filter.
 */
export function ActiveFilterChips({ filters, groups, onRemove, onClear }: ActiveFilterChipsProps) {
  const chips = activeFilters(filters, groups)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="gap-1 py-1 pr-1 pl-2.5 text-xs">
          <span className="max-w-64 truncate">{chip.label}</span>
          <button
            type="button"
            aria-label={`Remove ${chip.label} filter`}
            className="rounded-full p-0.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onRemove(chip.clear)}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={onClear}
        >
          Clear all
        </button>
      )}
    </div>
  )
}
