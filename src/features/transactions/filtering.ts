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
  accounts: string[]
  excludedAccounts: string[]
  provider: string
  providers: string[]
  excludedProviders: string[]
  transactionType: string
  transactionTypes: string[]
  excludedTransactionTypes: string[]
  group: string
  sort: TransactionSort
}

export const defaultTransactionFilters: TransactionViewFilters = {
  search: "",
  category: "",
  categories: [],
  excludedCategories: [],
  account: "",
  accounts: [],
  excludedAccounts: [],
  provider: "",
  providers: [],
  excludedProviders: [],
  transactionType: "",
  transactionTypes: [],
  excludedTransactionTypes: [],
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
  const rawAccounts = params.get("accounts") ?? params.get("account") ?? ""
  const rawExcludedAccounts = params.get("excludedAccounts") ?? ""
  const rawProviders = params.get("providers") ?? params.get("provider") ?? ""
  const rawExcludedProviders = params.get("excludedProviders") ?? ""
  const rawTypes = params.get("transactionTypes") ?? params.get("type") ?? ""
  const rawExcludedTypes = params.get("excludedTransactionTypes") ?? ""
  return {
    search: params.get("q")?.slice(0, 200) ?? "",
    category: params.get("category")?.slice(0, 100) ?? "",
    categories: parseList(rawCategories),
    excludedCategories: parseList(rawExcluded),
    account: params.get("account")?.slice(0, 100) ?? "",
    accounts: parseList(rawAccounts),
    excludedAccounts: parseList(rawExcludedAccounts),
    provider: params.get("provider")?.slice(0, 100) ?? "",
    providers: parseList(rawProviders),
    excludedProviders: parseList(rawExcludedProviders),
    transactionType: params.get("type")?.slice(0, 100) ?? "",
    transactionTypes: parseList(rawTypes),
    excludedTransactionTypes: parseList(rawExcludedTypes),
    group: params.get("group")?.slice(0, 64) ?? "",
    sort: isTransactionSort(sort) ? sort : "date-desc",
  }
}

export function serializeTransactionFilters(filters: TransactionViewFilters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set("q", filters.search)
  // Categories
  if (filters.categories.length) params.set("categories", filters.categories.join(","))
  else if (filters.category) params.set("category", filters.category)
  if (filters.excludedCategories.length)
    params.set("excludedCategories", filters.excludedCategories.join(","))
  // Accounts
  if (filters.accounts.length) params.set("accounts", filters.accounts.join(","))
  else if (filters.account) params.set("account", filters.account)
  if (filters.excludedAccounts.length)
    params.set("excludedAccounts", filters.excludedAccounts.join(","))
  // Providers
  if (filters.providers.length) params.set("providers", filters.providers.join(","))
  else if (filters.provider) params.set("provider", filters.provider)
  if (filters.excludedProviders.length)
    params.set("excludedProviders", filters.excludedProviders.join(","))
  // Transaction types
  if (filters.transactionTypes.length)
    params.set("transactionTypes", filters.transactionTypes.join(","))
  else if (filters.transactionType) params.set("type", filters.transactionType)
  if (filters.excludedTransactionTypes.length)
    params.set("excludedTransactionTypes", filters.excludedTransactionTypes.join(","))
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
    const accountValue = transaction.accountName ?? ""
    const matchesAccount = (() => {
      if (filters.excludedAccounts.includes(accountValue)) return false
      if (filters.accounts.length) return filters.accounts.includes(accountValue)
      if (filters.account) return accountValue === filters.account
      return true
    })()
    const providerValue = transaction.provider ?? ""
    const matchesProvider = (() => {
      if (filters.excludedProviders.includes(providerValue)) return false
      if (filters.providers.length) return filters.providers.includes(providerValue)
      if (filters.provider) return providerValue === filters.provider
      return true
    })()
    const typeValue = transaction.transactionType ?? ""
    const matchesType = (() => {
      if (filters.excludedTransactionTypes.includes(typeValue)) return false
      if (filters.transactionTypes.length) return filters.transactionTypes.includes(typeValue)
      if (filters.transactionType) return typeValue === filters.transactionType
      return true
    })()
    return (
      matchesSearch &&
      matchesCategory &&
      matchesAccount &&
      matchesProvider &&
      matchesType &&
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
