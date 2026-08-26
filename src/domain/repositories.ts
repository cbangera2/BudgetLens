import type {
  BudgetGoal,
  ImportBatch,
  IsoDate,
  Transaction,
  TransactionDraft,
  TransactionFilters,
  TransactionGroup,
  TransactionGroupFilters,
  SnapshotDateFilters,
  WealthAccountSnapshot,
  WealthBreakdownSnapshot,
  WealthFilters,
  WealthSnapshot,
} from "@/domain/models"

export interface TransactionRepository {
  list(filters?: TransactionFilters): Promise<Transaction[]>
  get(id: string): Promise<Transaction | undefined>
  add(draft: TransactionDraft): Promise<Transaction>
  update(id: string, draft: Partial<TransactionDraft>): Promise<Transaction>
  updateMany(ids: string[], draft: Partial<TransactionDraft>): Promise<void>
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

export interface TransactionGroupInput {
  id?: string
  name: string
  description?: string | null
  color?: TransactionGroup["color"]
  startDate?: IsoDate | null
  endDate?: IsoDate | null
  budgetMinor?: number | null
  archived?: boolean
}

export interface TransactionGroupRepository {
  list(filters?: TransactionGroupFilters): Promise<TransactionGroup[]>
  get(id: string): Promise<TransactionGroup | undefined>
  put(group: TransactionGroupInput): Promise<TransactionGroup>
  remove(id: string): Promise<void>
  members(id: string): Promise<Transaction[]>
  clear(): Promise<void>
}

export interface BudgetLensRepositories {
  transactions: TransactionRepository
  wealth: WealthRepository
  wealthBreakdown: WealthBreakdownRepository
  wealthAccounts: WealthAccountRepository
  imports: ImportRepository
  budgets: BudgetRepository
  transactionGroups: TransactionGroupRepository
}
