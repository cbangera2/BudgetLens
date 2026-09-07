import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { normalizeMerchant } from "@/features/subscriptions/detect"

/**
 * Transfer exclusion for the bill calendar (read-only reuse of transfer
 * signals, never merchant-name heuristics).
 *
 * A detected subscription is hidden as a transfer only when EVERY supporting
 * expense transaction for its normalized merchant key is flagged by a real
 * transfer signal: membership in a detected transfer pair
 * (`detectTransferPairs` matches opposite-sign amounts within $1.00 inside a
 * 4-day window across different accounts) or a user-confirmed transfer flag.
 * The "every" rule is deliberately strict: a genuine bill that coincidentally
 * pairs once still shows, while a standing savings sweep (every leg paired,
 * month after month) never flags as an overdue bill.
 *
 * One-sided imports (no matching leg, nothing user-confirmed) carry no signal
 * and stay visible; users can hide those with a per-merchant dismiss override.
 */
export function transferExcludedMerchantKeys(
  transactions: readonly Transaction[],
  transferTransactionIds: ReadonlySet<string>,
): Set<string> {
  if (transferTransactionIds.size === 0) return new Set()

  const expenseIdsByMerchant = new Map<string, Set<string>>()
  for (const transaction of transactions) {
    const signed = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (signed >= 0) continue
    const key = normalizeMerchant(transaction.description)
    if (!key) continue
    let ids = expenseIdsByMerchant.get(key)
    if (!ids) {
      ids = new Set()
      expenseIdsByMerchant.set(key, ids)
    }
    ids.add(transaction.id)
  }

  const excluded = new Set<string>()
  for (const [key, ids] of expenseIdsByMerchant) {
    if (ids.size === 0) continue
    let allFlagged = true
    for (const id of ids) {
      if (!transferTransactionIds.has(id)) {
        allFlagged = false
        break
      }
    }
    if (allFlagged) excluded.add(key)
  }
  return excluded
}
