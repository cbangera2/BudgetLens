import Papa from "papaparse"
import { z } from "zod"

import type {
  TransactionDraft,
  WealthAccountSnapshotDraft,
  WealthAccountType,
  WealthBreakdownSnapshotDraft,
  WealthSection,
  WealthSegment,
  WealthSeries,
  WealthSnapshotDraft,
} from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import {
  DEFAULT_IMPORT_LIMITS,
  type ImportIssue,
  type ImportLimits,
  type ParsedImport,
} from "@/features/imports/types"

type TransactionField =
  | "date"
  | "description"
  | "amount"
  | "category"
  | "transactionType"
  | "accountName"
  | "accountType"
  | "provider"
  | "labels"
  | "notes"

const TRANSACTION_HEADERS = new Map<string, TransactionField>([
  ["date", "date"],
  ["description", "description"],
  ["store/vendor", "description"],
  ["amount", "amount"],
  ["category", "category"],
  ["transaction type", "transactionType"],
  ["type", "transactionType"],
  ["account name", "accountName"],
  ["account type", "accountType"],
  ["provider", "provider"],
  ["labels", "labels"],
  ["notes", "notes"],
])

const textRowSchema = z.record(z.string(), z.string())
const unknownRecordSchema = z.record(z.string(), z.unknown())
const budgetLensBundleSchema = z.object({
  format: z.literal("budgetlens"),
  version: z.literal(1),
  transactions: z.array(z.unknown()),
  netWorthHistory: z.array(z.unknown()),
  investmentHistory: z.array(z.unknown()),
  netWorthBreakdown: z.array(z.unknown()),
  wealthAccounts: z.array(z.unknown()),
})
const dateSchema = z.string().transform((value, context) => {
  const trimmed = value.trim()
  let year: number
  let month: number
  let day: number

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (us) {
    month = Number(us[1])
    day = Number(us[2])
    year = Number(us[3])
  } else {
    context.addIssue({ code: "custom", message: "Use YYYY-MM-DD or M/D/YYYY." })
    return z.NEVER
  }

  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    context.addIssue({ code: "custom", message: "Date is not a valid calendar date." })
    return z.NEVER
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
})

const moneySchema = z.string().transform((value, context) => {
  let normalized = value.trim()
  let negative = false
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    negative = true
    normalized = normalized.slice(1, -1).trim()
  }
  normalized = normalized.replaceAll(",", "").replace(/^\$/, "").trim()
  if (normalized.startsWith("-")) {
    negative = !negative
    normalized = normalized.slice(1)
  } else if (normalized.startsWith("+")) {
    normalized = normalized.slice(1)
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    context.addIssue({
      code: "custom",
      message: "Amount must be a number with at most 2 decimals.",
    })
    return z.NEVER
  }
  const [whole, fraction = ""] = normalized.split(".")
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(minor)) {
    context.addIssue({ code: "custom", message: "Amount is outside the supported range." })
    return z.NEVER
  }
  return negative ? -minor : minor
})

function canonicalHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function sanitizeImportSourceName(name: string): string {
  const basename = name.replaceAll("\\", "/").split("/").at(-1)?.trim() || "import.csv"
  const printable = basename
    .split("")
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code > 31 && code !== 127
    })
    .join("")
  return printable.slice(0, 255) || "import.csv"
}

async function sha256(content: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function describeZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ")
}

function parseTransaction(
  raw: Record<string, string>,
  mapping: Map<string, TransactionField>,
): TransactionDraft {
  const normalized: Partial<Record<TransactionField, string>> = {}
  for (const [header, value] of Object.entries(raw)) {
    const field = mapping.get(header)
    if (field) normalized[field] = value
  }

  const date = dateSchema.safeParse(normalized.date ?? "")
  if (!date.success) throw new Error(`Invalid Date: ${describeZodError(date.error)}`)
  const amount = moneySchema.safeParse(normalized.amount ?? "")
  if (!amount.success) throw new Error(`Invalid Amount: ${describeZodError(amount.error)}`)

  const transactionType = nullable(normalized.transactionType)
  return {
    date: date.data,
    description: normalized.description?.trim() ?? "",
    amountMinor: normalizeTransactionAmountMinor(amount.data, transactionType),
    category: nullable(normalized.category),
    transactionType,
    accountName: nullable(normalized.accountName),
    accountType: nullable(normalized.accountType),
    provider: nullable(normalized.provider),
    labels:
      normalized.labels
        ?.split(/[;|]/)
        .map((label) => label.trim())
        .filter(Boolean) ?? [],
    notes: nullable(normalized.notes),
  }
}

function jsonDate(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  const timestamp = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(trimmed)
  return timestamp?.[1] ?? trimmed
}

function jsonMoney(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return typeof value === "string" ? value : ""
}

function record(value: unknown): Record<string, unknown> | null {
  const parsed = unknownRecordSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function atPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    const currentRecord = record(current)
    if (!currentRecord) return undefined
    current = currentRecord[key]
  }
  return current
}

function transactionArray(response: unknown): unknown[] | null {
  const candidates = [
    atPath(response, ["data", "prime", "transactionsHub", "transactionPage", "transactions"]),
    atPath(response, ["data", "prime", "transactionList", "transactions"]),
    atPath(response, ["data", "transactions"]),
    atPath(response, ["transactions"]),
  ]
  return candidates.find(Array.isArray) ?? null
}

function jsonTransactionRows(value: unknown): unknown[] | null {
  const root = record(value)
  if (!root) return Array.isArray(value) ? value : null

  // Debug exports contain overlapping list and hub responses. Prefer hub pages because they
  // reflect user category edits and avoid importing the same transaction twice.
  if (Array.isArray(root.hubPages)) {
    const hubRows = root.hubPages.flatMap((page) => transactionArray(page) ?? [])
    if (hubRows.length > 0) return hubRows
  }
  if (root.transactionsList) {
    const listRows = transactionArray(root.transactionsList)
    if (listRows) return listRows
  }
  return transactionArray(value)
}

function parseJsonTransaction(value: unknown): TransactionDraft {
  const candidate = record(value)
  if (!candidate) throw new Error("Transaction is not an object.")
  const amountObject = record(candidate.amount)
  const categoryObject = record(candidate.category)
  const accountObject = record(candidate.account)
  const providerObject = record(accountObject?.provider)
  const merchantObject = record(candidate.merchant)

  const date = dateSchema.safeParse(jsonDate(candidate.date ?? candidate.transactionDate))
  if (!date.success) throw new Error(`Invalid Date: ${describeZodError(date.error)}`)
  const amount = moneySchema.safeParse(jsonMoney(amountObject?.value ?? candidate.amount))
  if (!amount.success) throw new Error(`Invalid Amount: ${describeZodError(amount.error)}`)

  const category = nullable(
    typeof candidate.category === "string"
      ? candidate.category
      : typeof categoryObject?.name === "string"
        ? categoryObject.name
        : undefined,
  )
  const categoryType = typeof categoryObject?.type === "string" ? categoryObject.type : null
  const explicitType =
    typeof candidate.transactionType === "string" ? candidate.transactionType : null
  const transactionType =
    explicitType ??
    (categoryType === "INCOME"
      ? "credit"
      : categoryType === "EXPENSE" || amount.data < 0
        ? "debit"
        : null)
  const descriptionValue =
    typeof candidate.description === "string"
      ? candidate.description
      : typeof merchantObject?.name === "string"
        ? merchantObject.name
        : ""
  const labels = Array.isArray(candidate.labels)
    ? candidate.labels
        .filter((label): label is string => typeof label === "string")
        .map((label) => label.trim())
        .filter(Boolean)
    : []

  return {
    date: date.data,
    description: descriptionValue.trim(),
    amountMinor: normalizeTransactionAmountMinor(amount.data, transactionType),
    category,
    transactionType,
    accountName: nullable(
      typeof candidate.accountName === "string"
        ? candidate.accountName
        : typeof accountObject?.name === "string"
          ? accountObject.name
          : undefined,
    ),
    accountType: nullable(
      typeof candidate.accountType === "string"
        ? candidate.accountType
        : typeof accountObject?.type === "string"
          ? accountObject.type
          : typeof accountObject?.accountType === "string"
            ? accountObject.accountType
            : undefined,
    ),
    provider: nullable(
      typeof candidate.provider === "string"
        ? candidate.provider
        : typeof accountObject?.providerName === "string"
          ? accountObject.providerName
          : typeof providerObject?.name === "string"
            ? providerObject.name
            : undefined,
    ),
    labels,
    notes: nullable(typeof candidate.notes === "string" ? candidate.notes : undefined),
  }
}

function parseBundleWealthPoint(value: unknown, series: WealthSeries): WealthSnapshotDraft {
  const candidate = record(value)
  if (!candidate) throw new Error("History point is not an object.")
  const date = dateSchema.safeParse(jsonDate(candidate.date))
  if (!date.success) throw new Error(`Invalid Date: ${describeZodError(date.error)}`)
  const amount = moneySchema.safeParse(jsonMoney(candidate.value))
  if (!amount.success) throw new Error(`Invalid value: ${describeZodError(amount.error)}`)
  return { series, date: date.data, valueMinor: amount.data }
}

function parseBundleBreakdown(value: unknown): WealthBreakdownSnapshotDraft {
  const candidate = record(value)
  if (!candidate) throw new Error("Net worth category is not an object.")
  return parseWealthBreakdown({
    "as of": typeof candidate.asOf === "string" ? candidate.asOf : "",
    section: typeof candidate.section === "string" ? candidate.section : "",
    segment: typeof candidate.segment === "string" ? candidate.segment : "",
    balance: jsonMoney(candidate.balance),
    descriptor: typeof candidate.descriptor === "string" ? candidate.descriptor : "",
  })
}

function parseBundleWealthAccount(value: unknown): WealthAccountSnapshotDraft {
  const candidate = record(value)
  if (!candidate) throw new Error("Wealth account is not an object.")
  return parseWealthAccount({
    "as of": typeof candidate.asOf === "string" ? candidate.asOf : "",
    "account type": typeof candidate.accountType === "string" ? candidate.accountType : "",
    "source label": typeof candidate.sourceLabel === "string" ? candidate.sourceLabel : "",
    balance: jsonMoney(candidate.balance),
    descriptor: typeof candidate.descriptor === "string" ? candidate.descriptor : "",
  })
}

async function parseBudgetLensBundle(
  value: unknown,
  content: string,
  sourceName: string,
  limits: ImportLimits,
): Promise<ParsedImport> {
  const parsed = budgetLensBundleSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      "Invalid or unsupported BudgetLens bundle. Expected format budgetlens version 1.",
    )
  }

  const sections = [
    parsed.data.transactions,
    parsed.data.netWorthHistory,
    parsed.data.investmentHistory,
    parsed.data.netWorthBreakdown,
    parsed.data.wealthAccounts,
  ]
  const rowCount = sections.reduce((sum, rows) => sum + rows.length, 0)
  if (rowCount > limits.maxRows) {
    throw new Error(`File exceeds the ${limits.maxRows.toLocaleString()} row limit.`)
  }

  const transactions: TransactionDraft[] = []
  const wealth: WealthSnapshotDraft[] = []
  const wealthBreakdown: WealthBreakdownSnapshotDraft[] = []
  const wealthAccounts: WealthAccountSnapshotDraft[] = []
  const issues: ImportIssue[] = []
  let row = 0
  const collect = <T>(values: unknown[], target: T[], parser: (candidate: unknown) => T) => {
    for (const candidate of values) {
      row += 1
      try {
        target.push(parser(candidate))
      } catch (error) {
        issues.push({
          row,
          message: error instanceof Error ? error.message : "Invalid bundle row.",
        })
      }
    }
  }

  collect(parsed.data.transactions, transactions, parseJsonTransaction)
  collect(parsed.data.netWorthHistory, wealth, (candidate) =>
    parseBundleWealthPoint(candidate, "netWorth"),
  )
  collect(parsed.data.investmentHistory, wealth, (candidate) =>
    parseBundleWealthPoint(candidate, "investment"),
  )
  collect(parsed.data.netWorthBreakdown, wealthBreakdown, parseBundleBreakdown)
  collect(parsed.data.wealthAccounts, wealthAccounts, parseBundleWealthAccount)

  return {
    kind: "bundle",
    sourceName: sanitizeImportSourceName(sourceName),
    sourceHash: await sha256(content),
    rowCount,
    transactions,
    wealth,
    wealthBreakdown,
    wealthAccounts,
    issues,
  }
}

export async function parseJsonImport(
  content: string,
  sourceName: string,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ParsedImport> {
  if (new TextEncoder().encode(content).byteLength > limits.maxFileBytes) {
    throw new Error(`File exceeds the ${limits.maxFileBytes.toLocaleString()} byte limit.`)
  }
  if (content.includes("\0")) throw new Error("Binary files are not supported.")

  let value: unknown
  try {
    value = JSON.parse(content) as unknown
  } catch {
    throw new Error("JSON parsing failed. Check that the file contains complete, valid JSON.")
  }
  if (record(value)?.format === "budgetlens") {
    return parseBudgetLensBundle(value, content, sourceName, limits)
  }
  const rows = jsonTransactionRows(value)
  if (!rows) {
    throw new Error(
      "Unsupported JSON structure. Expected a Credit Karma transaction response or debug export.",
    )
  }
  if (rows.length > limits.maxRows) {
    throw new Error(`File exceeds the ${limits.maxRows.toLocaleString()} row limit.`)
  }

  const transactions: TransactionDraft[] = []
  const issues: ImportIssue[] = []
  rows.forEach((candidate, index) => {
    try {
      transactions.push(parseJsonTransaction(candidate))
    } catch (error) {
      issues.push({
        row: index + 1,
        message: error instanceof Error ? error.message : "Invalid transaction.",
      })
    }
  })
  return {
    kind: "transactions",
    sourceName: sanitizeImportSourceName(sourceName),
    sourceHash: await sha256(content),
    rowCount: rows.length,
    transactions,
    wealth: [],
    wealthBreakdown: [],
    wealthAccounts: [],
    issues,
  }
}

export function importFileType(sourceName: string): "csv" | "json" | null {
  const extension = sanitizeImportSourceName(sourceName).split(".").at(-1)?.toLocaleLowerCase()
  if (extension === "csv") return "csv"
  if (extension === "json") return "json"
  return null
}

export function parseImportContent(
  content: string,
  sourceName: string,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ParsedImport> {
  const type = importFileType(sourceName)
  if (type === "json") return parseJsonImport(content, sourceName, limits)
  if (type === "csv") return parseImportText(content, sourceName, limits)
  throw new Error("Unsupported file type. Select a .csv or .json file.")
}

function parseWealth(
  raw: Record<string, string>,
  valueHeader: string,
  series: WealthSeries,
): WealthSnapshotDraft {
  const date = dateSchema.safeParse(raw.date ?? "")
  if (!date.success) throw new Error(`Invalid Date: ${describeZodError(date.error)}`)
  const value = moneySchema.safeParse(raw[valueHeader] ?? "")
  if (!value.success) throw new Error(`Invalid value: ${describeZodError(value.error)}`)
  return { series, date: date.data, valueMinor: value.data }
}

function parseSnapshotDate(value: string): string {
  const date = dateSchema.safeParse(jsonDate(value))
  if (!date.success) throw new Error(`Invalid As Of: ${describeZodError(date.error)}`)
  return date.data
}

function parseWealthBreakdown(raw: Record<string, string>): WealthBreakdownSnapshotDraft {
  const sectionValue = raw.section?.trim().toLowerCase()
  if (sectionValue !== "assets" && sectionValue !== "debts") {
    throw new Error("Section must be assets or debts.")
  }
  const segmentKey =
    raw.segment
      ?.trim()
      .toLowerCase()
      .replaceAll(/[\s_-]/g, "") ?? ""
  const segments: Record<string, WealthSegment> = {
    cash: "cash",
    investments: "investments",
    property: "property",
    creditcards: "creditCards",
    loans: "loans",
  }
  const segment = segments[segmentKey]
  if (!segment) {
    throw new Error("Segment must be cash, investments, property, creditCards, or loans.")
  }
  const expectedSection: WealthSection =
    segment === "creditCards" || segment === "loans" ? "debts" : "assets"
  if (sectionValue !== expectedSection) {
    throw new Error(`${segment} must use the ${expectedSection} section.`)
  }
  const value = moneySchema.safeParse(raw.balance ?? "")
  if (!value.success) throw new Error(`Invalid Balance: ${describeZodError(value.error)}`)

  return {
    date: parseSnapshotDate(raw["as of"] ?? ""),
    section: sectionValue,
    segment,
    valueMinor: value.data,
    descriptor: nullable(raw.descriptor),
  }
}

function isWealthAccountType(value: string): value is WealthAccountType {
  return value === "cash" || value === "investments" || value === "property"
}

function parseWealthAccount(raw: Record<string, string>): WealthAccountSnapshotDraft {
  const accountTypeValue = raw["account type"]?.trim().toLowerCase() ?? ""
  if (!isWealthAccountType(accountTypeValue)) {
    throw new Error("Account Type must be cash, investments, or property.")
  }
  const sourceLabel = raw["source label"]?.trim()
  if (!sourceLabel) throw new Error("Source Label is required.")
  const value = moneySchema.safeParse(raw.balance ?? "")
  if (!value.success) throw new Error(`Invalid Balance: ${describeZodError(value.error)}`)

  return {
    date: parseSnapshotDate(raw["as of"] ?? ""),
    accountType: accountTypeValue,
    sourceLabel,
    valueMinor: value.data,
    descriptor: nullable(raw.descriptor),
  }
}

export async function parseImportText(
  content: string,
  sourceName: string,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ParsedImport> {
  if (new TextEncoder().encode(content).byteLength > limits.maxFileBytes) {
    throw new Error(`File exceeds the ${limits.maxFileBytes.toLocaleString()} byte limit.`)
  }
  if (content.includes("\0")) throw new Error("Binary files are not supported.")

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: canonicalHeader,
  })
  if (parsed.errors.length) {
    const first = parsed.errors[0]!
    throw new Error(
      `CSV parsing failed${first.row === undefined ? "" : ` near row ${first.row + 1}`}: ${first.message}`,
    )
  }
  if (!parsed.meta.fields?.length) throw new Error("The CSV file does not contain a header row.")
  if (parsed.meta.renamedHeaders && Object.keys(parsed.meta.renamedHeaders).length > 0) {
    throw new Error("CSV contains duplicate headers.")
  }
  if (parsed.data.length > limits.maxRows) {
    throw new Error(`File exceeds the ${limits.maxRows.toLocaleString()} row limit.`)
  }

  const fields = parsed.meta.fields.map(canonicalHeader)
  if (new Set(fields).size !== fields.length) throw new Error("CSV contains duplicate headers.")

  const fieldSet = new Set(fields)
  let kind: ParsedImport["kind"]
  let wealthHeader: string | null = null
  const isBreakdown = ["as of", "section", "segment", "balance", "descriptor"].every((field) =>
    fieldSet.has(field),
  )
  const isWealthAccounts = ["as of", "account type", "source label", "balance", "descriptor"].every(
    (field) => fieldSet.has(field),
  )
  if (isBreakdown && fields.length === 5) {
    kind = "wealthBreakdown"
  } else if (isWealthAccounts && fields.length === 5) {
    kind = "wealthAccounts"
  } else if (fieldSet.has("date") && fieldSet.has("net worth") && fields.length === 2) {
    kind = "netWorth"
    wealthHeader = "net worth"
  } else if (fieldSet.has("date") && fieldSet.has("investment value") && fields.length === 2) {
    kind = "investment"
    wealthHeader = "investment value"
  } else if (fieldSet.has("date") && fieldSet.has("amount")) {
    kind = "transactions"
  } else {
    throw new Error(
      "Unsupported headers. Expected a transaction, wealth history, net worth breakdown, or wealth accounts CSV.",
    )
  }

  const mapping = new Map<string, TransactionField>()
  if (kind === "transactions") {
    for (const header of fields) {
      const target = TRANSACTION_HEADERS.get(header)
      if (target) {
        if ([...mapping.values()].includes(target)) {
          throw new Error(`Multiple headers map to ${target}. Keep only one alias.`)
        }
        mapping.set(header, target)
      }
    }
  }

  const transactions: TransactionDraft[] = []
  const wealth: WealthSnapshotDraft[] = []
  const wealthBreakdown: WealthBreakdownSnapshotDraft[] = []
  const wealthAccounts: WealthAccountSnapshotDraft[] = []
  const issues: ImportIssue[] = []

  parsed.data.forEach((candidate, index) => {
    const row = index + 2
    const rawResult = textRowSchema.safeParse(candidate)
    if (!rawResult.success) {
      issues.push({ row, message: "Row contains an unsupported value." })
      return
    }
    try {
      if (kind === "transactions") transactions.push(parseTransaction(rawResult.data, mapping))
      else if (kind === "wealthBreakdown") {
        wealthBreakdown.push(parseWealthBreakdown(rawResult.data))
      } else if (kind === "wealthAccounts") {
        wealthAccounts.push(parseWealthAccount(rawResult.data))
      } else {
        wealth.push(parseWealth(rawResult.data, wealthHeader!, kind))
      }
    } catch (error) {
      issues.push({ row, message: error instanceof Error ? error.message : "Invalid row." })
    }
  })

  return {
    kind,
    sourceName: sanitizeImportSourceName(sourceName),
    sourceHash: await sha256(content),
    rowCount: parsed.data.length,
    transactions,
    wealth,
    wealthBreakdown,
    wealthAccounts,
    issues,
  }
}
