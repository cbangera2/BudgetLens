export const TRANSACTION_RULES_STORAGE_KEY = "budgetlens.transaction-rules.v1"

export type TransactionRuleAmountOperator = "eq" | "gt" | "gte" | "lt" | "lte"

export const TRANSACTION_RULE_AMOUNT_OPERATORS: readonly TransactionRuleAmountOperator[] = [
  "eq",
  "gt",
  "gte",
  "lt",
  "lte",
]

export interface TransactionRule {
  id: string
  merchantSubstring: string | null
  amountOperator: TransactionRuleAmountOperator | null
  amountMinor: number | null
  category: string
  createdAt: string
  updatedAt: string
}

export interface TransactionRuleInput {
  merchantSubstring: string
  amountOperator: string
  amountDollars: string
  category: string
}

export function isTransactionRuleAmountOperator(
  value: unknown,
): value is TransactionRuleAmountOperator {
  return value === "eq" || value === "gt" || value === "gte" || value === "lt" || value === "lte"
}

export function amountOperatorLabel(operator: TransactionRuleAmountOperator): string {
  switch (operator) {
    case "eq":
      return "equals"
    case "gt":
      return "greater than"
    case "gte":
      return "greater than or equal to"
    case "lt":
      return "less than"
    case "lte":
      return "less than or equal to"
    default:
      return "equals"
  }
}

export function formatRuleAmountMinor(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : ""
  const absolute = Math.abs(amountMinor)
  const dollars = Math.floor(absolute / 100).toLocaleString("en-US")
  const cents = (absolute % 100).toString().padStart(2, "0")
  return `${sign}$${dollars}.${cents}`
}

export function parseRuleAmountDollarsToMinor(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  let normalized = trimmed.replaceAll(",", "").replace(/^\$/, "").trim()
  let negative = false
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    negative = true
    normalized = normalized.slice(1, -1).trim()
  }
  if (normalized.startsWith("-")) {
    negative = !negative
    normalized = normalized.slice(1)
  } else if (normalized.startsWith("+")) {
    normalized = normalized.slice(1)
  }
  normalized = normalized.replace(/^\$/, "").trim()
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ""] = normalized.split(".")
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(minor)) return null
  return negative ? -minor : minor
}

export function validateTransactionRuleInput(input: TransactionRuleInput): string | null {
  const category = input.category.trim()
  if (!category) return "Enter a category to apply."
  if (category.length > 100) return "Category must be 100 characters or fewer."

  const merchant = input.merchantSubstring.trim()
  if (merchant.length > 200) return "Merchant text must be 200 characters or fewer."

  const operatorRaw = input.amountOperator.trim()
  const hasOperator = operatorRaw !== ""
  const amountMinor = parseRuleAmountDollarsToMinor(input.amountDollars)

  if (hasOperator && !isTransactionRuleAmountOperator(operatorRaw)) {
    return "Choose a valid amount condition."
  }
  if (hasOperator && amountMinor === null) return "Enter a valid amount for the condition."
  if (!hasOperator && input.amountDollars.trim() !== "") {
    return "Choose an amount condition or clear the amount."
  }
  if (!merchant && !hasOperator) {
    return "Add a merchant and/or an amount condition."
  }
  return null
}

function identifier(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return `rule-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`
}

export function buildTransactionRule(
  input: TransactionRuleInput,
  existing?: TransactionRule,
): TransactionRule {
  const now = new Date().toISOString()
  const merchant = input.merchantSubstring.trim()
  const operatorRaw = input.amountOperator.trim()
  const operator = isTransactionRuleAmountOperator(operatorRaw) ? operatorRaw : null
  const amountMinor = operator ? parseRuleAmountDollarsToMinor(input.amountDollars) : null
  return {
    id: existing?.id ?? identifier(),
    merchantSubstring: merchant ? merchant : null,
    amountOperator: operator,
    amountMinor: operator ? (amountMinor ?? null) : null,
    category: input.category.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function normalizeTransactionRule(value: unknown): TransactionRule | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<TransactionRule>
  if (typeof candidate.id !== "string" || !candidate.id.trim()) return null
  if (typeof candidate.category !== "string" || !candidate.category.trim()) return null
  if (candidate.category.trim().length > 100) return null

  let merchantSubstring: string | null = null
  if (candidate.merchantSubstring !== null && candidate.merchantSubstring !== undefined) {
    if (typeof candidate.merchantSubstring !== "string") return null
    const trimmed = candidate.merchantSubstring.trim()
    if (!trimmed) return null
    if (trimmed.length > 200) return null
    merchantSubstring = trimmed
  }

  let amountOperator: TransactionRuleAmountOperator | null = null
  let amountMinor: number | null = null
  const hasOperator = candidate.amountOperator !== null && candidate.amountOperator !== undefined
  const hasAmount = candidate.amountMinor !== null && candidate.amountMinor !== undefined
  if (hasOperator || hasAmount) {
    if (!isTransactionRuleAmountOperator(candidate.amountOperator)) return null
    if (typeof candidate.amountMinor !== "number" || !Number.isSafeInteger(candidate.amountMinor)) {
      return null
    }
    amountOperator = candidate.amountOperator
    amountMinor = candidate.amountMinor
  }
  if (!merchantSubstring && !amountOperator) return null

  return {
    id: candidate.id,
    merchantSubstring,
    amountOperator,
    amountMinor,
    category: candidate.category.trim(),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  }
}

export function normalizeTransactionRules(value: unknown): TransactionRule[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const rules: TransactionRule[] = []
  for (const entry of value) {
    const rule = normalizeTransactionRule(entry)
    if (!rule || seen.has(rule.id)) continue
    seen.add(rule.id)
    rules.push(rule)
  }
  return rules
}

export function loadTransactionRules(storage?: Storage): TransactionRule[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(TRANSACTION_RULES_STORAGE_KEY)
    if (!raw) return []
    return normalizeTransactionRules(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function persistTransactionRules(
  rules: readonly TransactionRule[],
  storage?: Storage,
): void {
  if (!storage) return
  try {
    storage.setItem(TRANSACTION_RULES_STORAGE_KEY, JSON.stringify(rules))
  } catch {
    // Storage may be unavailable or full; rules still apply for this session.
  }
}

export function defaultRulesStorage(): Storage | undefined {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
  } catch {
    // Ignore and fall through to globalThis.
  }
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage
    if (candidate) return candidate
  } catch {
    return undefined
  }
  return undefined
}

export function loadTransactionRulesFromDefaultStorage(): TransactionRule[] {
  return loadTransactionRules(defaultRulesStorage())
}

export function moveTransactionRule(
  rules: readonly TransactionRule[],
  id: string,
  direction: -1 | 1,
): TransactionRule[] {
  const from = rules.findIndex((rule) => rule.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= rules.length) return [...rules]
  const next = [...rules]
  const current = next[from]!
  const other = next[to]!
  next[from] = other
  next[to] = current
  return next
}

export function describeTransactionRule(rule: TransactionRule): string {
  const parts: string[] = []
  if (rule.merchantSubstring) parts.push(`merchant contains "${rule.merchantSubstring}"`)
  if (rule.amountOperator && rule.amountMinor !== null) {
    parts.push(
      `amount ${amountOperatorLabel(rule.amountOperator)} ${formatRuleAmountMinor(rule.amountMinor)}`,
    )
  }
  return `${parts.join(" and ")} → ${rule.category}`
}
