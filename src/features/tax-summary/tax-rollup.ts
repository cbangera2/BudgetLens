import Papa from "papaparse"

import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { onlyActiveTransactions } from "@/features/splits/splits"

import type { TaxFlags } from "./tax-flags"

export type TaxRole = "deductible" | "taxable" | "charitable"

/**
 * Auto-detection for charitable-giving categories. A category whose name
 * matches is treated as charitable unless the user explicitly flagged it
 * otherwise (including "none"), so the match is always user-overridable.
 */
export const CHARITABLE_CATEGORY_PATTERN = /charit|donat/i

export function matchesCharitableName(category: string): boolean {
  return CHARITABLE_CATEGORY_PATTERN.test(category)
}

export function isCharitableCategory(category: string, flags: TaxFlags = {}): boolean {
  const flag = flags[category]
  if (flag === "charitable") return true
  if (flag !== undefined) return false
  return matchesCharitableName(category)
}

/** Effective tax role for a category: explicit flags win over auto-detection. */
export function resolveTaxRole(category: string | null, flags: TaxFlags = {}): TaxRole | null {
  const name = category?.trim()
  if (!name) return null
  const flag = flags[name]
  if (flag === "deductible" || flag === "taxable" || flag === "charitable") return flag
  if (flag === "none") return null
  return matchesCharitableName(name) ? "charitable" : null
}

/**
 * Value to persist when the user marks a category "not tax-relevant": an
 * explicit "none" when the charitable auto-match would otherwise claim it,
 * otherwise null (removes the entry).
 */
export function unflagValue(category: string): "none" | null {
  return matchesCharitableName(category.trim()) ? "none" : null
}

function isYearDate(date: string, year: number): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 4) === String(year)
}

function parseYearOf(date: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(date)
  if (!match?.[1]) return null
  const year = Number(match[1])
  return Number.isInteger(year) ? year : null
}

/**
 * Years selectable in the tax-year picker, derived entirely from transaction
 * dates (newest first). Nothing is hardcoded: a fresh store yields [].
 */
export function availableTaxYears(transactions: readonly Transaction[]): number[] {
  const years = new Set<number>()
  for (const transaction of transactions) {
    const year = parseYearOf(transaction.date)
    if (year !== null) years.add(year)
  }
  return [...years].toSorted((left, right) => right - left)
}

/** Latest data year, falling back to the current year when there is no data. */
export function defaultTaxYear(
  transactions: readonly Transaction[],
  currentYear = new Date().getFullYear(),
): number {
  let latest: number | null = null
  for (const transaction of transactions) {
    const year = parseYearOf(transaction.date)
    if (year !== null && (latest === null || year > latest)) latest = year
  }
  return latest ?? currentYear
}

export interface TaxCategoryTotal {
  category: string
  amountMinor: number
}

export interface TaxSummary {
  year: number
  deductibleByCategory: TaxCategoryTotal[]
  deductibleTotalMinor: number
  charitableCategories: string[]
  charitableMinor: number
  taxableCategories: string[]
  taxableIncomeMinor: number
  netMinor: number
  transactionCount: number
}

/**
 * Year rollup over active transactions (superseded split parents excluded;
 * split children count as ordinary rows, so a split straddling New Year
 * attributes each part to its own row date). Amounts follow the signed
 * convention via normalizeTransactionAmountMinor: deductible and charitable
 * figures are expense magnitudes (refunds net against them), taxable income
 * is net income. Net = taxable income minus deductible minus charitable.
 */
export function buildTaxSummary(
  year: number,
  transactions: readonly Transaction[],
  flags: TaxFlags = {},
): TaxSummary {
  const deductible = new Map<string, number>()
  const charitableCategories = new Set<string>()
  const taxableCategories = new Set<string>()
  let charitableMinor = 0
  let taxableIncomeMinor = 0
  let transactionCount = 0

  for (const transaction of onlyActiveTransactions(transactions)) {
    if (!isYearDate(transaction.date, year)) continue
    const role = resolveTaxRole(transaction.category, flags)
    if (role === null) continue
    transactionCount += 1
    const amountMinor = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (role === "deductible") {
      const category = (transaction.category ?? "").trim()
      deductible.set(category, (deductible.get(category) ?? 0) + -amountMinor)
    } else if (role === "charitable") {
      charitableCategories.add((transaction.category ?? "").trim())
      charitableMinor += -amountMinor
    } else {
      taxableCategories.add((transaction.category ?? "").trim())
      taxableIncomeMinor += amountMinor
    }
  }

  const deductibleByCategory: TaxCategoryTotal[] = [...deductible.entries()]
    .filter(([, amountMinor]) => amountMinor !== 0)
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .toSorted(
      (left, right) =>
        right.amountMinor - left.amountMinor || left.category.localeCompare(right.category),
    )
  const deductibleTotalMinor = deductibleByCategory.reduce(
    (sum, entry) => sum + entry.amountMinor,
    0,
  )

  return {
    year,
    deductibleByCategory,
    deductibleTotalMinor,
    charitableCategories: [...charitableCategories].toSorted(),
    charitableMinor,
    taxableCategories: [...taxableCategories].toSorted(),
    taxableIncomeMinor,
    netMinor: taxableIncomeMinor - deductibleTotalMinor - charitableMinor,
    transactionCount,
  }
}

export type TaxEmptyState = "no-flags" | "empty-year" | null

/**
 * Guidance selector for the report: prompt flagging when no category is
 * flagged at all, year-specific guidance when the selected year rolls up
 * nothing, otherwise null (show the figures).
 */
export function describeTaxEmptyState(summary: TaxSummary, hasFlags: boolean): TaxEmptyState {
  if (!hasFlags) return "no-flags"
  if (summary.transactionCount === 0) return "empty-year"
  return null
}

/** Header vocabulary for the tax-summary CSV export. */
export const TAX_EXPORT_HEADERS = ["Section", "Category", "Amount"] as const

function formatDollars(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2)
}

/**
 * Serialize the rollup for export: one row per deductible category, the
 * charitable line when a matching category exists, then taxable income and
 * net totals. Amounts are human decimals (dollars.cents).
 */
export function serializeTaxSummaryToCsv(summary: TaxSummary): string {
  const data: string[][] = summary.deductibleByCategory.map((entry) => [
    "Deductible",
    entry.category,
    formatDollars(entry.amountMinor),
  ])
  if (summary.charitableCategories.length > 0) {
    data.push([
      "Charitable giving",
      summary.charitableCategories.join("; "),
      formatDollars(summary.charitableMinor),
    ])
  }
  data.push([
    "Taxable income",
    summary.taxableCategories.join("; "),
    formatDollars(summary.taxableIncomeMinor),
  ])
  data.push(["Net", "Taxable income minus deductions", formatDollars(summary.netMinor)])
  return Papa.unparse({ fields: [...TAX_EXPORT_HEADERS], data }, { newline: "\n" })
}

export function buildTaxExportFilename(year: number): string {
  return `tax-summary-${year}.csv`
}
