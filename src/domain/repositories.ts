import type {
  BudgetGoal,
  ImportBatch,
  Transaction,
  TransactionDraft,
  TransactionFilters,
  SnapshotDateFilters,
  WealthAccountSnapshot,
  WealthBreakdownSnapshot,
  WealthFilters,
  WealthSnapshot,
} from "@/domain/models"

export interface TransactionRepository {
  list(filters?: TransactionFilters): Promise<Transaction[]>
  add(draft: TransactionDraft): Promise<Transaction>
  update(id: string, draft: Partial<TransactionDraft>): Promise<Transaction>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export interface WealthRepository {
  list(filters?: WealthFilters): Promise<WealthSnapshot[]>
  clear(): Promise<void>
}

export interface WealthBreakdownRepository {
  list(filters?: SnapshotDateFilters): Promise<WealthBreakdownSnapshot[]>
  clear(): Promise<void>
}

export interface WealthAccountRepository {
  list(filters?: SnapshotDateFilters): Promise<WealthAccountSnapshot[]>
  clear(): Promise<void>
}

export interface ImportRepository {
  list(): Promise<ImportBatch[]>
  clear(): Promise<void>
}

export interface BudgetRepository {
  list(): Promise<BudgetGoal[]>
  put(goal: BudgetGoal): Promise<BudgetGoal>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export interface BudgetLensRepositories {
  transactions: TransactionRepository
  wealth: WealthRepository
  wealthBreakdown: WealthBreakdownRepository
  wealthAccounts: WealthAccountRepository
  imports: ImportRepository
  budgets: BudgetRepository
}
