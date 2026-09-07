export type CsvMappableField = "date" | "amount" | "description" | "category" | "account" | "type"

export interface CsvMappableFieldMeta {
  key: CsvMappableField
  label: string
  required: boolean
}

export const CSV_MAPPABLE_FIELDS: readonly CsvMappableFieldMeta[] = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "description", label: "Description", required: true },
  { key: "category", label: "Category", required: false },
  { key: "account", label: "Account", required: false },
  { key: "type", label: "Type", required: false },
]

export const CSV_REQUIRED_FIELDS: readonly CsvMappableField[] = ["date", "amount", "description"]

export type CsvColumnMapping = Record<CsvMappableField, string | null>

export const CSV_COLUMN_ALIASES: Record<CsvMappableField, readonly string[]> = {
  date: [
    "date",
    "transaction date",
    "posting date",
    "posted date",
    "post date",
    "trans date",
    "value date",
    "booking date",
    "booked date",
    "effective date",
    "day",
  ],
  amount: [
    "amount",
    "transaction amount",
    "value",
    "sum",
    "total",
    "amt",
    "net amount",
    "gross amount",
    "payment amount",
    "withdrawal",
    "deposit",
    "debit amount",
    "credit amount",
    "money in",
    "money out",
  ],
  description: [
    "description",
    "transaction description",
    "desc",
    "details",
    "detail",
    "transaction details",
    "merchant",
    "merchant name",
    "merchant details",
    "store/vendor",
    "store vendor",
    "store",
    "vendor",
    "payee",
    "narrative",
    "memo",
    "particulars",
    "transaction info",
    "name",
  ],
  category: [
    "category",
    "cat",
    "spending category",
    "transaction category",
    "category name",
    "class",
    "budget category",
  ],
  account: ["account", "account name", "acct", "account no", "account number", "account label"],
  type: [
    "type",
    "transaction type",
    "txn type",
    "flow",
    "direction",
    "debit/credit",
    "credit/debit",
    "dr/cr",
    "kind",
  ],
}

export function normalizeCsvHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

export function suggestCsvMapping(headers: readonly string[]): CsvColumnMapping {
  const result: CsvColumnMapping = {
    date: null,
    amount: null,
    description: null,
    category: null,
    account: null,
    type: null,
  }
  const used = new Set<number>()
  const order: readonly CsvMappableField[] = [
    "date",
    "amount",
    "description",
    "category",
    "account",
    "type",
  ]
  for (const field of order) {
    const aliases = new Set(CSV_COLUMN_ALIASES[field].map(normalizeCsvHeader))
    for (let index = 0; index < headers.length; index += 1) {
      if (used.has(index)) continue
      const candidate = headers[index] ?? ""
      if (!candidate.trim()) continue
      if (aliases.has(normalizeCsvHeader(candidate))) {
        result[field] = candidate
        used.add(index)
        break
      }
    }
  }
  return result
}

export function missingRequiredCsvFields(mapping: CsvColumnMapping): CsvMappableField[] {
  return CSV_REQUIRED_FIELDS.filter((field) => {
    const selected = mapping[field]
    return !selected || !selected.trim()
  })
}

export function validateCsvMapping(mapping: CsvColumnMapping): string | null {
  const missing = missingRequiredCsvFields(mapping)
  if (missing.length > 0) {
    const labels = missing
      .map((field) => CSV_MAPPABLE_FIELDS.find((meta) => meta.key === field)?.label ?? field)
      .join(", ")
    return `Select a column for each required field: ${labels}.`
  }
  const seen = new Map<string, CsvMappableField>()
  for (const meta of CSV_MAPPABLE_FIELDS) {
    const selected = mapping[meta.key]
    if (!selected || !selected.trim()) continue
    const normalized = normalizeCsvHeader(selected)
    const previous = seen.get(normalized)
    if (previous) {
      const previousLabel =
        CSV_MAPPABLE_FIELDS.find((entry) => entry.key === previous)?.label ?? previous
      return `Select different columns for ${previousLabel} and ${meta.label}. Each field needs its own column.`
    }
    seen.set(normalized, meta.key)
  }
  return null
}
