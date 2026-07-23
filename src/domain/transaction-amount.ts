const CREDIT_TYPES = new Set(["income", "credit", "credits", "job", "refund"])
const DEBIT_TYPES = new Set(["expense", "debit", "debits", "purchase", "payment"])

export type TransactionDirection = "credit" | "debit" | null

export function transactionDirection(transactionType: string | null): TransactionDirection {
  const normalized = transactionType?.trim().toLocaleLowerCase()
  if (!normalized) return null
  if (CREDIT_TYPES.has(normalized)) return "credit"
  if (DEBIT_TYPES.has(normalized)) return "debit"
  return null
}

/** Converts absolute Credit Karma amounts to BudgetLens's signed convention. */
export function normalizeTransactionAmountMinor(
  amountMinor: number,
  transactionType: string | null,
): number {
  const direction = transactionDirection(transactionType)
  if (direction === "credit") return Math.abs(amountMinor)
  if (direction === "debit") return -Math.abs(amountMinor)
  return amountMinor
}
