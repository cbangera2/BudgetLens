import type { Transaction } from "@/domain/models"
import { detectSubscriptions } from "@/features/subscriptions/detect"
import { detectTransferPairs } from "@/features/transfers/detection"
import {
  confirmedTransferIds,
  dismissedTransferIds,
  type TransferFlags,
} from "@/features/transfers/store"

export interface ReviewQueueCounts {
  /** Suggested transfer pairs still awaiting confirm or dismiss. */
  transfersQueue: number
  /** Recurring merchants detected from transaction history. */
  subscriptionsFound: number
  /** Saved transaction rules applied during import preview. */
  rulesActive: number
  /** Transactions still missing a category. */
  uncategorized: number
}

export interface ReviewQueueInput {
  transactions: readonly Transaction[]
  transferFlags: TransferFlags
  ruleCount: number
}

export function summarizeReviewQueues({
  transactions,
  transferFlags,
  ruleCount,
}: ReviewQueueInput): ReviewQueueCounts {
  const confirmedIds = confirmedTransferIds(transferFlags)
  const dismissedIds = dismissedTransferIds(transferFlags)
  // Same suggested-pair predicate as TransfersSection: a pair stays in the
  // queue only while neither leg is confirmed nor dismissed.
  const transfersQueue = detectTransferPairs(transactions).filter(
    (pair) =>
      !dismissedIds.has(pair.expenseId) &&
      !dismissedIds.has(pair.incomeId) &&
      !confirmedIds.has(pair.expenseId) &&
      !confirmedIds.has(pair.incomeId),
  ).length
  const { subscriptions } = detectSubscriptions(transactions)
  const uncategorized = transactions.filter(
    (transaction) => (transaction.category ?? "").trim() === "",
  ).length
  return {
    transfersQueue,
    subscriptionsFound: subscriptions.length,
    rulesActive: ruleCount,
    uncategorized,
  }
}

export function isReviewQueueEmpty(counts: ReviewQueueCounts): boolean {
  return (
    counts.transfersQueue === 0 &&
    counts.subscriptionsFound === 0 &&
    counts.rulesActive === 0 &&
    counts.uncategorized === 0
  )
}
