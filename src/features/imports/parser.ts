import Papa from "papaparse"
import { z } from "zod"

import type { TransactionDraft, WealthSeries, WealthSnapshotDraft } from "@/domain/models"
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
    .toLocaleLowerCase()
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
    typeof categoryObject?.name === "string" ? categoryObject.name : undefined,
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
    accountName: nullable(typeof accountObject?.name === "string" ? accountObject.name : undefined),
    accountType: nullable(
      typeof accountObject?.type === "string"
        ? accountObject.type
        : typeof accountObject?.accountType === "string"
          ? accountObject.accountType
          : undefined,
    ),
    provider: nullable(
      typeof accountObject?.providerName === "string"
        ? accountObject.providerName
        : typeof providerObject?.name === "string"
          ? providerObject.name
          : undefined,
    ),
    labels,
    notes: nullable(typeof candidate.notes === "string" ? candidate.notes : undefined),
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
  if (fieldSet.has("date") && fieldSet.has("net worth") && fields.length === 2) {
    kind = "netWorth"
    wealthHeader = "net worth"
  } else if (fieldSet.has("date") && fieldSet.has("investment value") && fields.length === 2) {
    kind = "investment"
    wealthHeader = "investment value"
  } else if (fieldSet.has("date") && fieldSet.has("amount")) {
    kind = "transactions"
  } else {
    throw new Error(
      "Unsupported headers. Expected Date and Amount, Date and Net Worth, or Date and Investment Value.",
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
      else wealth.push(parseWealth(rawResult.data, wealthHeader!, kind))
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
    issues,
  }
}
