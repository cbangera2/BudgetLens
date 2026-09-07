import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

import { isIsoDate } from "./date-presets"
import { matchesAmountConditions, parseSearchQuery } from "./search-operators"

export type TransactionSort =
  | "date-desc"
  | "date-asc"
  | "amount-desc"
  | "amount-asc"
  | "description"

export interface TransactionViewFilters {
  search: string
  merchant: string
  merchants: string[]
  excludedMerchants: string[]
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
  importBatch: string
  sort: TransactionSort
  /** Inclusive ISO date bounds (`YYYY-MM-DD`); "" means unbounded. */
  from: string
  to: string
}

export const defaultTransactionFilters: TransactionViewFilters = {
  search: "",
  merchant: "",
  merchants: [],
  excludedMerchants: [],
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
  importBatch: "",
  sort: "date-desc",
  from: "",
  to: "",
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

function parseList(raw: string, max = 100): string[] {
  return raw
    .split(",")
    .map((value) => value.trim().slice(0, max))
    .filter(Boolean)
}

// Repeated query params preserve commas inside values (e.g. "Example Market,
// North"). A single occurrence keeps legacy comma-separated parsing so existing
// bookmarks continue to work.
function parseRepeatedOrLegacy(params: URLSearchParams, name: string, max = 100): string[] {
  const occurrences = params.getAll(name)
  if (occurrences.length > 1)
    return occurrences.map((value) => value.trim().slice(0, max)).filter(Boolean)
  if (occurrences.length === 1) return parseList(occurrences[0] ?? "", max)
  return []
}

function parseFacetList(
  params: URLSearchParams,
  singularName: string,
  pluralName: string,
  max = 100,
): string[] {
  if (params.has(pluralName)) return parseRepeatedOrLegacy(params, pluralName, max)
  const singular = params.get(singularName)
  if (singular !== null && singular.trim()) return [singular.trim().slice(0, max)]
  return []
}

function appendListParam(params: URLSearchParams, name: string, values: readonly string[]) {
  for (const value of values) params.append(name, value)
}

// `excludeCategory` stays accepted with its exact legacy comma-split behavior;
// the newer `excludedCategory` singular holds one whole value.
function parseCategoryExcludes(params: URLSearchParams): string[] {
  if (params.has("excludedCategories")) return parseRepeatedOrLegacy(params, "excludedCategories")
  const singular = params.get("excludedCategory")
  if (singular !== null && singular.trim()) return [singular.trim().slice(0, 100)]
  return parseList(params.get("excludeCategory") ?? "")
}

// Singular excluded params preserve commas in a single excluded value, mirroring
// the include-side singular/plural duality.
function parseExcludeList(
  params: URLSearchParams,
  singularName: string,
  pluralName: string,
  max = 100,
): string[] {
  if (params.has(pluralName)) return parseRepeatedOrLegacy(params, pluralName, max)
  const singular = params.get(singularName)
  if (singular !== null && singular.trim()) return [singular.trim().slice(0, max)]
  return []
}

export function parseTransactionFilters(search: string): TransactionViewFilters {
  const params = new URLSearchParams(search)
  const sort = params.get("sort")
  const merchantSingular = params.get("merchant")
  const categorySingular = params.get("category")
  const accountSingular = params.get("account")
  const rawProviders = params.get("providers") ?? params.get("provider") ?? ""
  const rawExcludedProviders = params.get("excludedProviders") ?? ""
  const rawTypes = params.get("transactionTypes") ?? params.get("type") ?? ""
  const rawExcludedTypes = params.get("excludedTransactionTypes") ?? ""
  // Date bounds are new params: the scheme previously had no date filters, so
  // `from`/`to` do not collide with any legacy bookmark.
  const from = params.get("from")?.slice(0, 10) ?? ""
  const to = params.get("to")?.slice(0, 10) ?? ""
  return {
    search: params.get("q")?.slice(0, 200) ?? "",
    merchant: merchantSingular?.slice(0, 200) ?? "",
    merchants: parseFacetList(params, "merchant", "merchants", 200),
    excludedMerchants: parseExcludeList(params, "excludedMerchant", "excludedMerchants", 200),
    category: categorySingular?.slice(0, 100) ?? "",
    categories: parseFacetList(params, "category", "categories"),
    excludedCategories: parseCategoryExcludes(params),
    account: accountSingular?.slice(0, 100) ?? "",
    accounts: parseFacetList(params, "account", "accounts"),
    excludedAccounts: parseExcludeList(params, "excludedAccount", "excludedAccounts"),
    provider: params.get("provider")?.slice(0, 100) ?? "",
    providers: parseList(rawProviders),
    excludedProviders: parseList(rawExcludedProviders),
    transactionType: params.get("type")?.slice(0, 100) ?? "",
    transactionTypes: parseList(rawTypes),
    excludedTransactionTypes: parseList(rawExcludedTypes),
    group: params.get("group")?.slice(0, 64) ?? "",
    importBatch: (params.get("importBatch") ?? params.get("batch") ?? "").slice(0, 64),
    sort: isTransactionSort(sort) ? sort : "date-desc",
    from: isIsoDate(from) ? from : "",
    to: isIsoDate(to) ? to : "",
  }
}

export function serializeTransactionFilters(filters: TransactionViewFilters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set("q", filters.search)
  // Merchants (description facet): single values use the singular param so
  // commas in merchant names survive the round-trip; multiple values use
  // repeated params for the same reason.
  const [singleMerchant] = filters.merchants
  if (filters.merchants.length > 1) appendListParam(params, "merchants", filters.merchants)
  else if (singleMerchant) params.set("merchant", singleMerchant)
  else if (filters.merchant) params.set("merchant", filters.merchant)
  if (filters.excludedMerchants.length > 1)
    appendListParam(params, "excludedMerchants", filters.excludedMerchants)
  else if (filters.excludedMerchants.length === 1) {
    const [single] = filters.excludedMerchants
    if (single) params.set("excludedMerchant", single)
  }
  // Categories
  const [singleCategory] = filters.categories
  if (filters.categories.length > 1) appendListParam(params, "categories", filters.categories)
  else if (singleCategory) params.set("category", singleCategory)
  else if (filters.category) params.set("category", filters.category)
  if (filters.excludedCategories.length > 1)
    appendListParam(params, "excludedCategories", filters.excludedCategories)
  else if (filters.excludedCategories.length === 1) {
    const [single] = filters.excludedCategories
    if (single) params.set("excludedCategory", single)
  }
  // Accounts
  const [singleAccount] = filters.accounts
  if (filters.accounts.length > 1) appendListParam(params, "accounts", filters.accounts)
  else if (singleAccount) params.set("account", singleAccount)
  else if (filters.account) params.set("account", filters.account)
  if (filters.excludedAccounts.length > 1)
    appendListParam(params, "excludedAccounts", filters.excludedAccounts)
  else if (filters.excludedAccounts.length === 1) {
    const [single] = filters.excludedAccounts
    if (single) params.set("excludedAccount", single)
  }
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
  if (filters.importBatch) params.set("importBatch", filters.importBatch)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.sort !== "date-desc") params.set("sort", filters.sort)
  return params.toString()
}

export function filterAndSortTransactions(
  transactions: readonly Transaction[],
  filters: TransactionViewFilters,
): Transaction[] {
  // Structured operators live inside the search box; the remainder stays a
  // plain-text query. Unknown `word:value` tokens fall back to plain text.
  const parsed = parseSearchQuery(filters.search)
  const query = parsed.text.trim().toLocaleLowerCase()
  const merchantOperator = parsed.merchant?.toLocaleLowerCase() ?? null
  const categoryOperator = parsed.category?.toLocaleLowerCase() ?? null
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
    const merchantValue = transaction.description ?? ""
    const matchesMerchant = (() => {
      if (filters.excludedMerchants.includes(merchantValue)) return false
      if (filters.merchants.length) return filters.merchants.includes(merchantValue)
      if (filters.merchant) return merchantValue === filters.merchant
      return true
    })()
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
    const matchesOperators =
      (!merchantOperator ||
        transaction.description.toLocaleLowerCase().includes(merchantOperator)) &&
      (!categoryOperator ||
        (transaction.category ?? "").toLocaleLowerCase().includes(categoryOperator)) &&
      (parsed.amounts.length === 0 ||
        matchesAmountConditions(
          normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType),
          parsed.amounts,
        ))
    const matchesDates =
      (!filters.from || transaction.date >= filters.from) &&
      (!filters.to || transaction.date <= filters.to)
    return (
      matchesSearch &&
      matchesOperators &&
      matchesDates &&
      matchesMerchant &&
      matchesCategory &&
      matchesAccount &&
      matchesProvider &&
      matchesType &&
      (!filters.group || transaction.groupId === filters.group) &&
      (!filters.importBatch || transaction.importBatchId === filters.importBatch)
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
