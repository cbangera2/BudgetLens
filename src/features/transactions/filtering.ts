import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export type TransactionSort =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "description"

export interface TransactionViewFilters {
  search: string
  category: string
  categories: string[]
  excludedCategories: string[]
  account: string
  provider: string
  transactionType: string
  group: string
  sort: TransactionSort
}

export const defaultTransactionFilters: TransactionViewFilters = {
  search: "",
  category: "",
  categories: [],
  excludedCategories: [],
  account: "",
  provider: "",
  transactionType: "",
  group: "",
  sort: "date-desc",
}

export function isTransactionSort(value: unknown): value is TransactionSort {
  return (
    value === "date-desc" ||
    value === "date-asc" ||
    value === "amount-desc" ||
    value === "amount-asc" ||
    value === "description"
  )
}

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim().slice(0, 100))
    .filter(Boolean)
}

export function parseTransactionFilters(search: string): TransactionViewFilters {
  const params = new URLSearchParams(search)
  const sort = params.get("sort")
  const rawCategories = params.get("categories") ?? params.get("category") ?? ""
  const rawExcluded = params.get("excludedCategories") ?? params.get("excludeCategory") ?? ""
  return {
    search: params.get("q")?.slice(0, 200) ?? "",
    category: params.get("category")?.slice(0, 100) ?? "",
    categories: parseList(rawCategories),
    excludedCategories: parseList(rawExcluded),
    account: params.get("account")?.slice(0, 100) ?? "",
    provider: params.get("provider")?.slice(0, 100) ?? "",
    transactionType: params.get("type")?.slice(0, 100) ?? "",
    group: params.get("group")?.slice(0, 64) ?? "",
    sort: isTransactionSort(sort) ? sort : "date-desc",
  }
}

export function serializeTransactionFilters(filters: TransactionViewFilters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set("q", filters.search)
  // Legacy single category for backward compat, plus new multi-value params
  if (filters.categories.length) params.set("categories", filters.categories.join(","))
  else if (filters.category) params.set("category", filters.category)
  if (filters.excludedCategories.length)
    params.set("excludedCategories", filters.excludedCategories.join(","))
  if (filters.account) params.set("account", filters.account)
  if (filters.provider) params.set("provider", filters.provider)
  if (filters.transactionType) params.set("type", filters.transactionType)
  if (filters.group) params.set("group", filters.group)
  if (filters.sort !== "date-desc") params.set("sort", filters.sort)
  return params.toString()
}

export function filterAndSortTransactions(
  transactions: readonly Transaction[],
  filters: TransactionViewFilters,
): Transaction[] {
  const query = filters.search.trim().toLocaleLowerCase()
  const result = transactions.filter((transaction) => {
    const matchesSearch =
      !query ||
      [
        transaction.description,
        transaction.category,
        transaction.accountName,
        transaction.provider,
        transaction.notes,
      ].some((value) => value?.toLocaleLowerCase().includes(query))
    const categoryValue = transaction.category ?? ""
    const matchesCategory = (() => {
      if (filters.excludedCategories.includes(categoryValue)) return false
      if (filters.categories.length) return filters.categories.includes(categoryValue)
      if (filters.category) return categoryValue === filters.category
      return true
    })()
    return (
      matchesSearch &&
      matchesCategory &&
      (!filters.account || transaction.accountName === filters.account) &&
      (!filters.provider || transaction.provider === filters.provider) &&
      (!filters.transactionType || transaction.transactionType === filters.transactionType) &&
      (!filters.group || transaction.groupId === filters.group)
    )
  })

  return result.toSorted((left, right) => {
    switch (filters.sort) {
      case "date-asc":
        return left.date.localeCompare(right.date)
      case "amount-desc":
        return (
          normalizeTransactionAmountMinor(right.amountMinor, right.transactionType) -
          normalizeTransactionAmountMinor(left.amountMinor, left.transactionType)
        )
      case "amount-asc":
        return (
          normalizeTransactionAmountMinor(left.amountMinor, left.transactionType) -
          normalizeTransactionAmountMinor(right.amountMinor, right.transactionType)
        )
      case "description":
        return left.description.localeCompare(right.description)
      default:
        return right.date.localeCompare(left.date)
    }
  })
}
