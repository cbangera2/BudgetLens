// Bill-creep detection: recurring merchants whose latest charge exceeds the
// trailing baseline.
//
// Reuses the subscriptions feature read-only (detectSubscriptions decides who
// counts as recurring; normalizeMerchant folds descriptions) and the
// transaction-amount helper for the signed convention. Nothing here modifies
// those modules: creep only compares the latest charge against the median of
// the prior charges for merchants already known to recur.
//
// A creep flags when ALL hold:
// - the merchant recurs (3+ regular charges, per detectSubscriptions), so
//   one-time charges and first-time merchants never flag;
// - the latest charge is above the median of the prior charges by at least
//   `thresholdPct` percent (default +10%, boundary inclusive, integer math);
// - the absolute increase is at least `minDeltaMinor` (default $2.00) to kill
//   noise on small bills.
// Decreases and flat renewals never flag.

import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { detectSubscriptions, normalizeMerchant } from "@/features/subscriptions/detect"

/** Percent increase over baseline that counts as creep (boundary inclusive). */
export const BILL_CREEP_DEFAULT_THRESHOLD_PCT = 10

/** Minimum absolute increase (minor units) that counts as creep. Kills noise. */
export const BILL_CREEP_DEFAULT_MIN_DELTA_MINOR = 200

export interface BillCreep {
  /** Normalized merchant key (same key space as detectSubscriptions). */
  key: string
  displayName: string
  /** Median of the prior charges (everything before the latest), minor units. */
  baselineMinor: number
  /** Latest charge total for its calendar day, minor units. */
  latestMinor: number
  /** latestMinor - baselineMinor, always >= minDeltaMinor. */
  deltaMinor: number
  /** Percent increase over baseline, rounded to one decimal. */
  deltaPct: number
  /** Earliest charge date seen (YYYY-MM-DD). */
  firstSeenDate: string
  /** Latest charge date (YYYY-MM-DD). */
  latestDate: string
  occurrences: number
}

export interface DetectBillCreepOptions {
  /** Percent increase required; defaults to BILL_CREEP_DEFAULT_THRESHOLD_PCT. */
  thresholdPct?: number
  /** Absolute increase required; defaults to BILL_CREEP_DEFAULT_MIN_DELTA_MINOR. */
  minDeltaMinor?: number
  /** Already-dismissed merchant keys; matching creeps are skipped. */
  dismissedKeys?: ReadonlySet<string>
}

function median(values: readonly number[]): number {
  const sorted = [...values].toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function resolveThresholdPct(raw: number | undefined): number {
  if (raw === undefined) return BILL_CREEP_DEFAULT_THRESHOLD_PCT
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return BILL_CREEP_DEFAULT_THRESHOLD_PCT
  }
  return raw
}

function resolveMinDeltaMinor(raw: number | undefined): number {
  if (raw === undefined) return BILL_CREEP_DEFAULT_MIN_DELTA_MINOR
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return BILL_CREEP_DEFAULT_MIN_DELTA_MINOR
  }
  return Math.round(raw)
}

export function detectBillCreep(
  transactions: readonly Transaction[],
  options: DetectBillCreepOptions = {},
): BillCreep[] {
  const thresholdPct = resolveThresholdPct(options.thresholdPct)
  const minDeltaMinor = resolveMinDeltaMinor(options.minDeltaMinor)
  const dismissed = options.dismissedKeys

  const { subscriptions } = detectSubscriptions(transactions)
  if (subscriptions.length === 0) return []

  const creeps: BillCreep[] = []

  for (const subscription of subscriptions) {
    if (dismissed?.has(subscription.key)) continue

    // Per-day expense totals in chronological order (same-day splits sum,
    // mirroring the grouping in the reused detector).
    const amountsByDate = new Map<string, number>()
    for (const transaction of transactions) {
      if (normalizeMerchant(transaction.description) !== subscription.key) continue
      const signed = normalizeTransactionAmountMinor(
        transaction.amountMinor,
        transaction.transactionType,
      )
      if (signed >= 0) continue
      amountsByDate.set(
        transaction.date,
        (amountsByDate.get(transaction.date) ?? 0) + Math.abs(signed),
      )
    }
    const dates = [...amountsByDate.keys()].toSorted()
    // Recurrence already guarantees 3+ dates; guard anyway so the "prior"
    // baseline always has at least two charges to take a median over.
    if (dates.length < 3) continue
    const firstSeenDate = dates[0]
    const latestDate = dates.at(-1)
    if (firstSeenDate === undefined || latestDate === undefined) continue

    const ordered = dates.map((date) => amountsByDate.get(date) ?? 0)
    const latestMinor = ordered.at(-1) ?? 0
    const prior = ordered.slice(0, -1)
    const baselineMinor = Math.round(median(prior))
    if (!(baselineMinor > 0) || !(latestMinor > 0)) continue

    const deltaMinor = latestMinor - baselineMinor
    if (deltaMinor < minDeltaMinor) continue
    // Integer math so the exact boundary (e.g. exactly +10%) always flags.
    if (deltaMinor * 100 < baselineMinor * thresholdPct) continue

    creeps.push({
      key: subscription.key,
      displayName: subscription.displayName,
      baselineMinor,
      latestMinor,
      deltaMinor,
      deltaPct: Math.round((deltaMinor / baselineMinor) * 1000) / 10,
      firstSeenDate,
      latestDate,
      occurrences: dates.length,
    })
  }

  creeps.sort(
    (left, right) =>
      right.deltaPct - left.deltaPct || left.displayName.localeCompare(right.displayName),
  )
  return creeps
}
