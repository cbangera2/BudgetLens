export type IsoDate = string
export type IsoDateTime = string
export type WealthSeries = "netWorth" | "investment"
export type WealthSection = "assets" | "debts"
export type WealthSegment = "cash" | "investments" | "property" | "creditCards" | "loans"
export type WealthAccountType = "cash" | "investments" | "property"
export type ImportKind =
  | "transactions"
  | "bundle"
  | "wealthBreakdown"
  | "wealthAccounts"
  | WealthSeries

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
  groupId: string | null
  shared: boolean
  shareCount: number
  importBatchId: string
  fingerprint: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export type TransactionDraft = Omit<
  Transaction,
  | "id"
  | "importBatchId"
  | "fingerprint"
  | "createdAt"
  | "updatedAt"
  | "groupId"
  | "shared"
  | "shareCount"
> & {
  /** Group membership and shared-cost fields default when omitted. */
  groupId?: string | null
  shared?: boolean
  shareCount?: number
}

export const DEFAULT_SHARE_COUNT = 2

export function effectiveTransactionAmountMinor(
  amountMinor: number,
  shared: boolean,
  shareCount: number,
): number {
  return shared && shareCount > 1 ? Math.round(amountMinor / shareCount) : amountMinor
}

export interface TransactionGroup {
  id: string
  name: string
  description: string | null
  color: GroupColor
  startDate: IsoDate | null
  endDate: IsoDate | null
  budgetMinor: number | null
  archived: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export type GroupColor =
  | "violet"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "orange"
  | "pink"

export const GROUP_COLORS: readonly GroupColor[] = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "orange",
  "pink",
]

export type TransactionGroupDraft = Omit<TransactionGroup, "id" | "createdAt" | "updatedAt">

export interface TransactionGroupFilters {
  includeArchived?: boolean
}

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
