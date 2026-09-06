import type { Transaction } from "@/domain/models"
import { effectiveTransactionAmountMinor } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export interface SettlementBalance {
  member: string
  /** Positive = others owe this member (creditor). Negative = this member owes (debtor). */
  balanceMinor: number
}

export interface SettlementTransfer {
  /** Debtor who pays. */
  from: string
  /** Creditor who receives. */
  to: string
  amountMinor: number
}

export interface SettlementResult {
  balances: SettlementBalance[]
  transfers: SettlementTransfer[]
  memberCount: number
  sharedCount: number
}

export const SETTLEMENT_FALLBACK_MEMBER = "You"

/**
 * Payer inference rule (v1, no schema change): the member who fronted a
 * transaction is its trimmed `accountName`, falling back to `"You"` when
 * blank. Group membership is the distinct set of inferred payers across all
 * transactions in the group, so every member needs at least one transaction
 * in the group to be included.
 */
export function settlementMemberFor(transaction: Pick<Transaction, "accountName">): string {
  const name = transaction.accountName?.trim()
  return name ? name : SETTLEMENT_FALLBACK_MEMBER
}

function sortedMembers(transactions: readonly Transaction[]): string[] {
  const members = new Set<string>()
  for (const transaction of transactions) members.add(settlementMemberFor(transaction))
  return [...members].toSorted()
}

function isSharedExpenseCandidate(transaction: Transaction): boolean {
  if (!transaction.shared) return false
  if (transaction.shareCount < 2) return false
  const gross = normalizeTransactionAmountMinor(
    transaction.amountMinor,
    transaction.transactionType,
  )
  return gross !== 0
}

/**
 * Net balances per member in minor units. For each shared transaction the
 * payer fronted `gross` and their fair share is `share =
 * round(gross / shareCount)` (existing shareCount math). The rest of the
 * group combined owes the payer `payerDelta = share - gross` (positive for
 * expenses the payer fronted, negative for shared refunds the payer
 * received). That combined amount is split equally among the other members
 * in integer minor units; any indivisible remainder goes one unit at a time
 * to the alphabetically-first others so balances always sum to exactly zero.
 * Non-shared transactions only establish membership and never move balances.
 */
export function computeSettlementBalances(
  transactions: readonly Transaction[],
): SettlementBalance[] {
  const members = sortedMembers(transactions)
  const totals = new Map<string, number>(members.map((member) => [member, 0]))

  for (const transaction of transactions) {
    if (!isSharedExpenseCandidate(transaction)) continue
    if (members.length <= 1) continue
    const payer = settlementMemberFor(transaction)
    const gross = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    const share = effectiveTransactionAmountMinor(gross, true, transaction.shareCount)
    const payerDelta = share - gross
    if (payerDelta === 0) continue

    totals.set(payer, (totals.get(payer) ?? 0) + payerDelta)
    const others = members.filter((member) => member !== payer)
    const totalOther = -payerDelta
    const base = Math.trunc(totalOther / others.length)
    let remainder = totalOther - base * others.length
    const step = remainder > 0 ? 1 : -1
    for (const other of others) {
      let extra = 0
      if (remainder !== 0) {
        extra = step
        remainder -= step
      }
      totals.set(other, (totals.get(other) ?? 0) + base + extra)
    }
  }

  return members.map((member) => ({ member, balanceMinor: totals.get(member) ?? 0 }))
}

/**
 * Greedy largest-debtor-to-largest-creditor matching. Debtors (negative)
 * pay creditors (positive) in descending magnitude order until one side is
 * exhausted. This yields at most `members - 1` transfers (Splitwise-lite
 * simplification): chains like A owes B and B owes C collapse to fewer
 * direct paybacks. Zero-net members are excluded. Deterministic tie-breaks
 * use member names so output order is stable.
 *
 * Rounding-dust rule: transfers are integer minor units and must sum to
 * exactly the total creditor balance. If any remainder exists (for example
 * from prior integer splits), it is pushed onto the largest transfer so
 * `sum(transfers) == sum(creditor balances)` exactly.
 */
export function simplifyBalances(balances: readonly SettlementBalance[]): SettlementTransfer[] {
  const debtors = balances
    .filter((entry) => entry.balanceMinor < 0)
    .map((entry) => ({ ...entry }))
    .toSorted((left, right) =>
      left.balanceMinor === right.balanceMinor
        ? left.member.localeCompare(right.member)
        : left.balanceMinor - right.balanceMinor,
    )
  const creditors = balances
    .filter((entry) => entry.balanceMinor > 0)
    .map((entry) => ({ ...entry }))
    .toSorted((left, right) =>
      left.balanceMinor === right.balanceMinor
        ? left.member.localeCompare(right.member)
        : right.balanceMinor - left.balanceMinor,
    )
  if (debtors.length === 0 || creditors.length === 0) return []

  const transfers: SettlementTransfer[] = []
  let debtorIndex = 0
  let creditorIndex = 0
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!
    const creditor = creditors[creditorIndex]!
    const amount = Math.min(-debtor.balanceMinor, creditor.balanceMinor)
    if (amount <= 0) break
    transfers.push({ from: debtor.member, to: creditor.member, amountMinor: amount })
    debtor.balanceMinor += amount
    creditor.balanceMinor -= amount
    if (debtor.balanceMinor === 0) debtorIndex += 1
    if (creditor.balanceMinor === 0) creditorIndex += 1
  }

  const expected = balances
    .filter((entry) => entry.balanceMinor > 0)
    .reduce((sum, entry) => sum + entry.balanceMinor, 0)
  const actual = transfers.reduce((sum, transfer) => sum + transfer.amountMinor, 0)
  const dust = expected - actual
  if (dust !== 0 && transfers.length > 0) {
    let largestIndex = 0
    for (let index = 1; index < transfers.length; index += 1) {
      if (transfers[index]!.amountMinor > transfers[largestIndex]!.amountMinor) {
        largestIndex = index
      }
    }
    transfers[largestIndex]!.amountMinor += dust
  }

  return transfers.filter((transfer) => transfer.amountMinor > 0)
}

/**
 * Settle a group's transactions. Only `shared` transactions move balances;
 * every transaction (shared or not) establishes membership via the payer
 * inference rule. Single-member (or empty) groups settle to no transfers.
 */
export function settleGroupTransactions(transactions: readonly Transaction[]): SettlementResult {
  const members = sortedMembers(transactions)
  const sharedCount = transactions.filter((transaction) => transaction.shared).length
  if (members.length <= 1) {
    return {
      balances: members.map((member) => ({ member, balanceMinor: 0 })),
      transfers: [],
      memberCount: members.length,
      sharedCount,
    }
  }
  const balances = computeSettlementBalances(transactions)
  return {
    balances,
    transfers: simplifyBalances(balances),
    memberCount: members.length,
    sharedCount,
  }
}
