import { Transaction } from "@/lib/types";

export const CREDIT_TRANSACTION_TYPES = ["Income", "Credit", "credits", "credit", "Job", "Refund"] as const;
export const DEBIT_TRANSACTION_TYPES = ["Expense", "Debit", "debits", "debit", "Purchase", "Payment"] as const;

export type CreditTransactionType = typeof CREDIT_TRANSACTION_TYPES[number];
export type DebitTransactionType = typeof DEBIT_TRANSACTION_TYPES[number];

export function isCredit(transactionType: string): boolean {
  return CREDIT_TRANSACTION_TYPES.some(
    type => transactionType.toLowerCase() === type.toLowerCase()
  );
}

export function isDebit(transactionType: string): boolean {
  return DEBIT_TRANSACTION_TYPES.some(
    type => transactionType.toLowerCase() === type.toLowerCase()
  );
}

export function isCreditTransaction(transaction: Transaction): boolean {
  return isCredit(transaction.transactionType);
}

export function isDebitTransaction(transaction: Transaction): boolean {
  return isDebit(transaction.transactionType);
}
