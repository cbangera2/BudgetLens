import type { Transaction } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export const TRANSFER_AMOUNT_TOLERANCE_MINOR = 100
export const TRANSFER_DATE_WINDOW_DAYS = 4
const MS_PER_DAY = 86_400_000

export interface TransferPair {
  expenseId: string
  incomeId: string
  amountMinor: number
  dateGapDays: number
  fromAccount: string
  toAccount: string
}

export interface TransferDetectionOptions {
  amountToleranceMinor?: number
  dateWindowDays?: number
}

export interface SpendingExcludingTransfers {
  spendingMinor: number
  excludedMinor: number
  excludedCount: number
}

export function signedAmount(
  transaction: Pick<Transaction, "amountMinor" | "transactionType">,
): number {
  return normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType)
}

function parseIsoDateMs(date: string): number | null {
  const time = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(time) ? null : time
}

export function dateGapDays(left: string, right: string): number | null {
  const leftMs = parseIsoDateMs(left)
  const rightMs = parseIsoDateMs(right)
  if (leftMs === null || rightMs === null) return null
  return Math.round(Math.abs(leftMs - rightMs) / MS_PER_DAY)
}

export function normalizedAccountName(
  transaction: Pick<Transaction, "accountName">,
): string | null {
  const trimmed = transaction.accountName?.trim()
  return trimmed ? trimmed : null
}

function resolveOptions(options: TransferDetectionOptions = {}): {
  amountToleranceMinor: number
  dateWindowDays: number
} {
  return {
    amountToleranceMinor: options.amountToleranceMinor ?? TRANSFER_AMOUNT_TOLERANCE_MINOR,
    dateWindowDays: options.dateWindowDays ?? TRANSFER_DATE_WINDOW_DAYS,
  }
}

export function isPotentialTransferPair(
  left: Transaction,
  right: Transaction,
  options: TransferDetectionOptions = {},
): boolean {
  if (left.id === right.id) return false
  const { amountToleranceMinor, dateWindowDays } = resolveOptions(options)
  const leftSigned = signedAmount(left)
  const rightSigned = signedAmount(right)
  if (leftSigned === 0 || rightSigned === 0) return false
  if (Math.sign(leftSigned) === Math.sign(rightSigned)) return false

  if (Math.abs(Math.abs(leftSigned) - Math.abs(rightSigned)) > amountToleranceMinor) return false

  const gap = dateGapDays(left.date, right.date)
  if (gap === null || gap > dateWindowDays) return false

  const leftAccount = normalizedAccountName(left)
  const rightAccount = normalizedAccountName(right)
  if (!leftAccount || !rightAccount) return false
  return leftAccount.toLocaleLowerCase() !== rightAccount.toLocaleLowerCase()
}

interface Candidate {
  expense: Transaction
  income: Transaction
  amountDiff: number
  gap: number
}

export function detectTransferPairs(
  transactions: readonly Transaction[],
  options: TransferDetectionOptions = {},
): TransferPair[] {
  const { amountToleranceMinor, dateWindowDays } = resolveOptions(options)
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]))
  const expenses: Transaction[] = []
  const incomes: Transaction[] = []

  for (const transaction of transactions) {
    const signed = signedAmount(transaction)
    if (signed < 0) expenses.push(transaction)
    else if (signed > 0) incomes.push(transaction)
  }

  const candidates: Candidate[] = []
  for (const expense of expenses) {
    for (const income of incomes) {
      if (!isPotentialTransferPair(expense, income, { amountToleranceMinor, dateWindowDays })) {
        continue
      }
      const gap = dateGapDays(expense.date, income.date) ?? dateWindowDays
      candidates.push({
        expense,
        income,
        amountDiff: Math.abs(Math.abs(signedAmount(expense)) - Math.abs(signedAmount(income))),
        gap,
      })
    }
  }

  candidates.sort(
    (left, right) =>
      left.amountDiff - right.amountDiff ||
      left.gap - right.gap ||
      left.expense.date.localeCompare(right.expense.date) ||
      left.expense.id.localeCompare(right.expense.id) ||
      left.income.id.localeCompare(right.income.id),
  )

  const matched = new Set<string>()
  const pairs: TransferPair[] = []
  for (const candidate of candidates) {
    if (matched.has(candidate.expense.id) || matched.has(candidate.income.id)) continue
    matched.add(candidate.expense.id)
    matched.add(candidate.income.id)
    const expenseAccount = normalizedAccountName(candidate.expense) ?? ""
    const incomeAccount = normalizedAccountName(candidate.income) ?? ""
    pairs.push({
      expenseId: candidate.expense.id,
      incomeId: candidate.income.id,
      amountMinor: Math.round(
        (Math.abs(signedAmount(candidate.expense)) + Math.abs(signedAmount(candidate.income))) / 2,
      ),
      dateGapDays: candidate.gap,
      fromAccount: expenseAccount,
      toAccount: incomeAccount,
    })
  }

  pairs.sort((left, right) => {
    const leftDate = byId.get(left.expenseId)?.date ?? ""
    const rightDate = byId.get(right.expenseId)?.date ?? ""
    return leftDate.localeCompare(rightDate) || left.expenseId.localeCompare(right.expenseId)
  })
  return pairs
}

export function transferPairIds(pairs: readonly TransferPair[]): Set<string> {
  const ids = new Set<string>()
  for (const pair of pairs) {
    ids.add(pair.expenseId)
    ids.add(pair.incomeId)
  }
  return ids
}

export function excludeConfirmedTransfers(
  transactions: readonly Transaction[],
  confirmedIds: ReadonlySet<string>,
): Transaction[] {
  if (confirmedIds.size === 0) return [...transactions]
  return transactions.filter((transaction) => !confirmedIds.has(transaction.id))
}

export function sumSpendingMinor(transactions: readonly Transaction[]): number {
  let total = 0
  for (const transaction of transactions) {
    const signed = signedAmount(transaction)
    if (signed < 0) total += Math.abs(signed)
  }
  return total
}

export function spendingExcludingTransfers(
  transactions: readonly Transaction[],
  confirmedIds: ReadonlySet<string>,
): SpendingExcludingTransfers {
  const excluded = transactions.filter((transaction) => confirmedIds.has(transaction.id))
  return {
    spendingMinor: sumSpendingMinor(excludeConfirmedTransfers(transactions, confirmedIds)),
    excludedMinor: sumSpendingMinor(excluded),
    excludedCount: excluded.length,
  }
}
