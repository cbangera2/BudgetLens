export type IsoDate = string
export type IsoDateTime = string
export type WealthSeries = "netWorth" | "investment"
export type ImportKind = "transactions" | WealthSeries

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
