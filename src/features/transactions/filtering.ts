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
  account: string
  provider: string
  transactionType: string
  sort: TransactionSort
}

export const defaultTransactionFilters: TransactionViewFilters = {
  search: "",
  category: "",
  account: "",
  provider: "",
  transactionType: "",
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

export function parseTransactionFilters(search: string): TransactionViewFilters {
  const params = new URLSearchParams(search)
  const sort = params.get("sort")
  return {
    search: params.get("q")?.slice(0, 200) ?? "",
    category: params.get("category")?.slice(0, 100) ?? "",
    account: params.get("account")?.slice(0, 100) ?? "",
    provider: params.get("provider")?.slice(0, 100) ?? "",
    transactionType: params.get("type")?.slice(0, 100) ?? "",
    sort: isTransactionSort(sort) ? sort : "date-desc",
  }
}

export function serializeTransactionFilters(filters: TransactionViewFilters): string {
  const params = new URLSearchParams()
  if (filters.search) params.set("q", filters.search)
  if (filters.category) params.set("category", filters.category)
  if (filters.account) params.set("account", filters.account)
  if (filters.provider) params.set("provider", filters.provider)
  if (filters.transactionType) params.set("type", filters.transactionType)
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
    return (
      matchesSearch &&
      (!filters.category || transaction.category === filters.category) &&
      (!filters.account || transaction.accountName === filters.account) &&
      (!filters.provider || transaction.provider === filters.provider) &&
      (!filters.transactionType || transaction.transactionType === filters.transactionType)
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
