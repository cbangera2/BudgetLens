export type IsoDate = string
export type IsoDateTime = string
export type WealthSeries = "netWorth" | "investment"
export type WealthSection = "assets" | "debts"
export type WealthSegment = "cash" | "investments" | "property" | "creditCards" | "loans"
export type WealthAccountType = "cash" | "investments" | "property"
export type ImportKind = "transactions" | "wealthBreakdown" | "wealthAccounts" | WealthSeries

export interface Transaction {
  id: string
  date: IsoDate
  description: string
  amountMinor: number
  category: string | null
  transactionType: string | null
  accountName: string | null
  accountType: string | null
  provider: string | null
  labels: string[]
  notes: string | null
  importBatchId: string
  fingerprint: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export type TransactionDraft = Omit<
  Transaction,
  "id" | "importBatchId" | "fingerprint" | "createdAt" | "updatedAt"
>

export interface WealthSnapshot {
  id: string
  series: WealthSeries
  date: IsoDate
  valueMinor: number
  importBatchId: string
  fingerprint: string
  createdAt: IsoDateTime
}

export interface WealthSnapshotDraft {
  series: WealthSeries
  date: IsoDate
  valueMinor: number
}

export interface WealthBreakdownSnapshot {
  id: string
  date: IsoDate
  section: WealthSection
  segment: WealthSegment
  valueMinor: number
  descriptor: string | null
  importBatchId: string
  fingerprint: string
  createdAt: IsoDateTime
}

export type WealthBreakdownSnapshotDraft = Omit<
  WealthBreakdownSnapshot,
  "id" | "importBatchId" | "fingerprint" | "createdAt"
>

export interface WealthAccountSnapshot {
  id: string
  date: IsoDate
  accountType: WealthAccountType
  sourceLabel: string
  valueMinor: number
  descriptor: string | null
  importBatchId: string
  fingerprint: string
  createdAt: IsoDateTime
}

export type WealthAccountSnapshotDraft = Omit<
  WealthAccountSnapshot,
  "id" | "importBatchId" | "fingerprint" | "createdAt"
>

export interface ImportBatch {
  id: string
  kind: ImportKind
  sourceName: string
  sourceHash: string
  rowCount: number
  importedCount: number
  skippedCount: number
  replacedCount: number
  importedAt: IsoDateTime
}

export interface BudgetGoal {
  id: string
  category: string
  amountMinor: number
  period: "monthly" | "yearly"
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface TransactionFilters {
  startDate?: IsoDate
  endDate?: IsoDate
  categories?: string[]
  descriptions?: string[]
  transactionTypes?: string[]
  accountNames?: string[]
  search?: string
}

export interface WealthFilters {
  series?: WealthSeries[]
  startDate?: IsoDate
  endDate?: IsoDate
}

export interface SnapshotDateFilters {
  startDate?: IsoDate
  endDate?: IsoDate
}
