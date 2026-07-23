import type {
  ImportBatch,
  ImportKind,
  TransactionDraft,
  WealthSnapshotDraft,
} from "@/domain/models"

export type WealthConflictPolicy = "skip" | "replace"
export type DuplicatePolicy = "skip" | "include"

export interface ImportLimits {
  maxFileBytes: number
  maxFiles: number
  maxRows: number
  maxTotalBytes: number
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 20,
  maxRows: 100_000,
  maxTotalBytes: 50 * 1024 * 1024,
}

export interface ImportIssue {
  row: number | null
  message: string
}

export interface ParsedImport {
  kind: ImportKind
  sourceName: string
  sourceHash: string
  rowCount: number
  transactions: TransactionDraft[]
  wealth: WealthSnapshotDraft[]
  issues: ImportIssue[]
}

export interface ImportPreview extends ParsedImport {
  duplicateFile: boolean
  duplicateCount: number
  replacementCount: number
  importableCount: number
  duplicatePolicy: DuplicatePolicy
  wealthPolicy: WealthConflictPolicy
}

export interface ImportDeletionReceipt {
  batch: ImportBatch
  deletedTransactionCount: number
  deletedWealthCount: number
}

export interface ImportReceipt {
  batch: ImportBatch
}

export interface ImportFileInput {
  content: string
  sourceName: string
}

export interface ImportFileFailure {
  sourceName: string
  message: string
}

export interface ImportCollectionPreview {
  previews: ImportPreview[]
  failures: ImportFileFailure[]
  selectedCount: number
  rowCount: number
  importableCount: number
  duplicateCount: number
  invalidRowCount: number
}
