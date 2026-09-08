import Papa from "papaparse"

import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import type { TransactionViewFilters } from "@/features/transactions/filtering"

/** Header vocabulary the CSV importer accepts (see current-transactions.csv). */
export const TRANSACTION_EXPORT_HEADERS = [
  "Date",
  "Description",
  "Amount",
  "Category",
  "Transaction Type",
  "Account Name",
  "Account Type",
  "Provider",
  "Labels",
  "Notes",
] as const

export type ExportableTransaction = Pick<
  Transaction,
  | "date"
  | "description"
  | "amountMinor"
  | "category"
  | "transactionType"
  | "accountName"
  | "accountType"
  | "provider"
  | "labels"
  | "notes"
>

/** Human decimals (dollars.cents) for the signed minor amount the list shows. */
export function formatExportAmountMinor(
  amountMinor: number,
  transactionType: string | null,
): string {
  const normalized = normalizeTransactionAmountMinor(amountMinor, transactionType)
  return (normalized / 100).toFixed(2)
}

function cell(value: string | null | undefined): string {
  return value ?? ""
}

/** Serialize already-filtered/sorted rows; empty input yields a header-only CSV. */
export function serializeTransactionsToCsv(rows: readonly ExportableTransaction[]): string {
  // Text cells stay verbatim on purpose: this CSV is an interchange format for
  // the BudgetLens importer, and any spreadsheet-formula prefixing here would
  // corrupt the re-import round-trip (amounts also legitimately lead with "-").
  const data = rows.map((row) => [
    row.date,
    row.description,
    formatExportAmountMinor(row.amountMinor, row.transactionType ?? null),
    cell(row.category),
    cell(row.transactionType),
    cell(row.accountName),
    cell(row.accountType),
    cell(row.provider),
    (row.labels ?? []).join(";"),
    cell(row.notes),
  ])
  return Papa.unparse({ fields: [...TRANSACTION_EXPORT_HEADERS], data }, { newline: "\n" })
}

/** Lowercase slug for filename segments; "" when nothing filename-safe remains. */
export function sanitizeExportFilenameSegment(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
  return slug.slice(0, 48)
}

function pushToken(tokens: string[], raw: string | null | undefined): void {
  if (!raw) return
  const slug = sanitizeExportFilenameSegment(raw)
  if (slug) tokens.push(slug)
}

function pushSingleOrCount(
  tokens: string[],
  values: readonly string[],
  singular: string,
  countSuffix: string,
): void {
  if (values.length === 1 && values[0]) pushToken(tokens, values[0])
  else if (values.length > 1) pushToken(tokens, `${values.length}-${countSuffix}`)
  else pushToken(tokens, singular)
}

function pushExcludeTokens(tokens: string[], values: readonly string[], dimension: string): void {
  if (values.length === 1 && values[0]) {
    const slug = sanitizeExportFilenameSegment(values[0])
    if (slug) tokens.push(`not-${slug}`)
  } else if (values.length > 1) {
    tokens.push(`not-${values.length}-${dimension}`)
  }
}

function pushIdToken(tokens: string[], prefix: string, raw: string): void {
  const slug = sanitizeExportFilenameSegment(raw)
  if (slug) tokens.push(`${prefix}-${slug}`)
}

/**
 * transactions-<filter-slugs>-<YYYY-MM>.csv. Date bounds replace the month
 * fallback; everything is sanitized to [a-z0-9-]. The date suffix is always
 * preserved: only the filter-token head is truncated to fit.
 */
export function buildTransactionsExportFilename(
  filters: TransactionViewFilters,
  now: Date = new Date(),
): string {
  const tokens: string[] = []
  pushSingleOrCount(tokens, filters.categories, filters.category, "categories")
  pushSingleOrCount(tokens, filters.merchants, filters.merchant, "merchants")
  pushSingleOrCount(tokens, filters.accounts, filters.account, "accounts")
  pushSingleOrCount(tokens, filters.providers, filters.provider, "providers")
  pushSingleOrCount(tokens, filters.transactionTypes, filters.transactionType, "transaction-types")
  pushToken(tokens, filters.search)
  pushExcludeTokens(tokens, filters.excludedCategories, "categories")
  pushExcludeTokens(tokens, filters.excludedMerchants, "merchants")
  pushExcludeTokens(tokens, filters.excludedAccounts, "accounts")
  pushExcludeTokens(tokens, filters.excludedProviders, "providers")
  pushExcludeTokens(tokens, filters.excludedTransactionTypes, "types")
  if (filters.group) pushIdToken(tokens, "group", filters.group)
  if (filters.importBatch) pushIdToken(tokens, "batch", filters.importBatch)

  const dateTokens: string[] = []
  if (filters.from) pushToken(dateTokens, filters.from)
  if (filters.to && filters.to !== filters.from) pushToken(dateTokens, filters.to)
  if (dateTokens.length === 0) {
    dateTokens.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
  }
  const suffix = `-${dateTokens.join("-")}`

  const head = `transactions${tokens.length > 0 ? `-${tokens.join("-")}` : ""}`
  const available = 120 - suffix.length
  const trimmedHead = head
    .slice(0, Math.max("transactions".length, available))
    .replaceAll(/-+$/g, "")
  const stem = `${trimmedHead}${suffix}`
  return `${stem}.csv`
}

export function buildTransactionsExport(
  rows: readonly ExportableTransaction[],
  filters: TransactionViewFilters,
  now: Date = new Date(),
): { filename: string; csv: string } {
  return {
    filename: buildTransactionsExportFilename(filters, now),
    csv: serializeTransactionsToCsv(rows),
  }
}

/** Blob + anchor download plumbing (no new dependencies). */
export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
