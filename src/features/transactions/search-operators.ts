// Structured search operators for the Transactions search box.
//
// Supported prefixes (case-insensitive):
//   amount:>100 / amount:>=100.50 / amount:<50 / amount:<=-20 / amount:=42 / amount:42
//   merchant:<text> / merchant:"Quoted Name"
//   cat:<text> / category:<text> / cat:"Quoted Category"
//
// Amounts compare by absolute (spend) magnitude in dollars, so `amount:>100`
// finds both a -$250 expense and a $2,500 paycheck. Thresholds use their
// absolute value as well, so negative inputs stay graceful instead of odd.
//
// Anything else shaped like `word:value` (unknown operator) falls back to
// plain-text search: it stays in the residual query and never errors.

export type AmountComparison = "gt" | "gte" | "lt" | "lte" | "eq"

export interface AmountCondition {
  op: AmountComparison
  /** Threshold in minor units (integer cents) so comparisons stay exact. */
  valueMinor: number
  /** The matched source text, e.g. "amount:>100". Used for hint chips. */
  raw: string
}

export type SearchChipKind = "amount" | "merchant" | "category"

export interface SearchChip {
  kind: SearchChipKind
  label: string
  /** Stable unique key for rendering chip lists. */
  key: string
}

export interface ParsedSearch {
  /** Plain-text remainder after recognized operators are removed. */
  text: string
  amounts: AmountCondition[]
  merchant: string | null
  category: string | null
  chips: SearchChip[]
}

const MAX_VALUE_LENGTH = 100
const MAX_CONDITIONS = 10

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

// Matches one operator token at the current position. Quoted values may
// contain spaces; unquoted values run to the next whitespace.
const OPERATOR_PATTERN = /\s*(amount|merchant|cat|category)\s*:\s*("[^"]*"|'[^']*'|\S*)/gi
const AMOUNT_VALUE_PATTERN = /^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/

function comparisonLabel(op: AmountComparison): string {
  if (op === "gt") return ">"
  if (op === "gte") return ">="
  if (op === "lt") return "<"
  if (op === "lte") return "<="
  return "="
}

function toComparison(symbol: string | undefined): AmountComparison {
  if (symbol === ">") return "gt"
  if (symbol === ">=") return "gte"
  if (symbol === "<") return "lt"
  if (symbol === "<=") return "lte"
  return "eq"
}

export function parseSearchQuery(input: string): ParsedSearch {
  const empty: ParsedSearch = { text: "", amounts: [], merchant: null, category: null, chips: [] }
  if (!input || !input.trim()) return empty

  const amounts: AmountCondition[] = []
  let merchant: string | null = null
  let category: string | null = null
  const chips: SearchChip[] = []
  let chipIndex = 0

  // Remove recognized operators, leaving unknown `word:value` tokens in place
  // as plain text.
  const text = input.replace(OPERATOR_PATTERN, (match, name: string, rawValue: string) => {
    const key = name.toLowerCase()
    const value = stripQuotes(rawValue.trim()).trim()
    if (key === "amount") {
      const parsed = AMOUNT_VALUE_PATTERN.exec(value)
      if (!parsed || amounts.length >= MAX_CONDITIONS) return match
      const op = toComparison(parsed[1])
      const dollars = Number(parsed[2])
      if (!Number.isFinite(dollars)) return match
      const valueMinor = Math.round(dollars * 100)
      if (!Number.isSafeInteger(valueMinor)) return match
      amounts.push({ op, valueMinor, raw: match.trim() })
      chips.push({
        kind: "amount",
        label: `Amount ${comparisonLabel(op)} ${parsed[2]}`,
        key: `amount-${chipIndex++}`,
      })
      return " "
    }
    if (value.length === 0 || value.length > MAX_VALUE_LENGTH) return match
    if (key === "merchant") {
      merchant = value
      chips.push({
        kind: "merchant",
        label: `Merchant contains "${value}"`,
        key: `merchant-${chipIndex++}`,
      })
      return " "
    }
    category = value
    chips.push({
      kind: "category",
      label: `Category contains "${value}"`,
      key: `category-${chipIndex++}`,
    })
    return " "
  })

  return {
    text: text.replace(/\s+/g, " ").trim(),
    amounts,
    merchant,
    category,
    chips,
  }
}

export function matchesAmountConditions(
  amountMinor: number,
  conditions: readonly AmountCondition[],
): boolean {
  return conditions.every((condition) => {
    const magnitude = Math.abs(amountMinor)
    const threshold = Math.abs(condition.valueMinor)
    if (condition.op === "gt") return magnitude > threshold
    if (condition.op === "gte") return magnitude >= threshold
    if (condition.op === "lt") return magnitude < threshold
    if (condition.op === "lte") return magnitude <= threshold
    return magnitude === threshold
  })
}
