import Dexie from "dexie"

import type { BudgetLensDatabase } from "@/db/database"
import { database } from "@/db/database"
import type { ImportBatch, Transaction, TransactionDraft, WealthSnapshot } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { parseImportContent, sanitizeImportSourceName } from "@/features/imports/parser"
import {
  DEFAULT_IMPORT_LIMITS,
  type ImportCollectionPreview,
  type ImportDeletionReceipt,
  type ImportFileInput,
  type ImportPreview,
  type ImportReceipt,
  type DuplicatePolicy,
  type WealthConflictPolicy,
} from "@/features/imports/types"

function identifier(): string {
  return globalThis.crypto.randomUUID()
}

async function digest(value: string): Promise<string> {
  const result = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function transactionFingerprint(draft: TransactionDraft): Promise<string> {
  const amountMinor = normalizeTransactionAmountMinor(draft.amountMinor, draft.transactionType)
  return digest(
    JSON.stringify([
      draft.date,
      draft.description,
      amountMinor,
      draft.category,
      draft.transactionType,
      draft.accountName,
      draft.accountType,
      draft.provider,
      draft.labels,
      draft.notes,
    ]),
  )
}

function wealthFingerprint(series: string, date: string, valueMinor: number): Promise<string> {
  return digest(JSON.stringify([series, date, valueMinor]))
}

export class ImportService {
  constructor(private readonly db: BudgetLensDatabase = database) {}

  async preview(
    content: string,
    sourceName: string,
    wealthPolicy: WealthConflictPolicy = "skip",
    duplicatePolicy: DuplicatePolicy = "skip",
  ): Promise<ImportPreview> {
    const parsed = await parseImportContent(content, sourceName)
    const effectiveDuplicatePolicy: DuplicatePolicy =
      parsed.kind === "transactions" ? duplicatePolicy : "skip"
    const duplicateFile =
      (await this.db.imports.where("sourceHash").equals(parsed.sourceHash).count()) > 0
    let duplicateCount = 0
    let replacementCount = 0
    let importableCount = 0

    if (parsed.kind === "transactions") {
      const existing = new Set(
        await Promise.all((await this.db.transactions.toArray()).map(transactionFingerprint)),
      )
      const fingerprints = await Promise.all(parsed.transactions.map(transactionFingerprint))
      for (const fingerprint of fingerprints) {
        if (existing.has(fingerprint)) {
          duplicateCount += 1
          if (effectiveDuplicatePolicy === "include") importableCount += 1
        } else {
          existing.add(fingerprint)
          importableCount += 1
        }
      }
    } else {
      const existing = new Map(
        (await this.db.wealth.where("series").equals(parsed.kind).toArray()).map((row) => [
          row.date,
          row.valueMinor,
        ]),
      )
      for (const draft of parsed.wealth) {
        const prior = existing.get(draft.date)
        if (prior === draft.valueMinor) duplicateCount += 1
        else if (prior !== undefined) {
          if (wealthPolicy === "replace") {
            replacementCount += 1
            importableCount += 1
            existing.set(draft.date, draft.valueMinor)
          } else duplicateCount += 1
        } else {
          existing.set(draft.date, draft.valueMinor)
          importableCount += 1
        }
      }
    }

    if (duplicateFile && effectiveDuplicatePolicy === "skip") importableCount = 0

    return {
      ...parsed,
      duplicateFile,
      duplicateCount,
      replacementCount,
      importableCount,
      duplicatePolicy: effectiveDuplicatePolicy,
      wealthPolicy,
    }
  }

  async previewMany(
    files: ImportFileInput[],
    duplicatePolicy: DuplicatePolicy = "skip",
  ): Promise<ImportCollectionPreview> {
    if (files.length === 0) throw new Error("Select at least one JSON file.")
    if (files.length > DEFAULT_IMPORT_LIMITS.maxFiles) {
      throw new Error(`Select at most ${DEFAULT_IMPORT_LIMITS.maxFiles} JSON files at once.`)
    }
    const totalBytes = files.reduce(
      (sum, file) => sum + new TextEncoder().encode(file.content).byteLength,
      0,
    )
    if (totalBytes > DEFAULT_IMPORT_LIMITS.maxTotalBytes) {
      throw new Error(
        `Selected files exceed the ${DEFAULT_IMPORT_LIMITS.maxTotalBytes.toLocaleString()} combined byte limit.`,
      )
    }

    const previews: ImportPreview[] = []
    const failures: ImportCollectionPreview["failures"] = []
    const knownFingerprints = new Set(
      await Promise.all((await this.db.transactions.toArray()).map(transactionFingerprint)),
    )
    const knownFileHashes = new Set(
      (await this.db.imports.toArray()).map((batch) => batch.sourceHash),
    )

    for (const file of files) {
      const sourceName = sanitizeImportSourceName(file.sourceName)
      try {
        // Sequential work keeps the displayed duplicate counts deterministic across files.
        // oxlint-disable-next-line no-await-in-loop
        const preview = await this.preview(file.content, sourceName, "skip", duplicatePolicy)
        if (preview.kind !== "transactions") {
          throw new Error("Multi-file import currently supports transaction JSON files only.")
        }
        let duplicateCount = 0
        let importableCount = 0
        // oxlint-disable-next-line no-await-in-loop
        const fingerprints = await Promise.all(preview.transactions.map(transactionFingerprint))
        for (const fingerprint of fingerprints) {
          if (knownFingerprints.has(fingerprint)) {
            duplicateCount += 1
            if (duplicatePolicy === "include") importableCount += 1
          } else {
            knownFingerprints.add(fingerprint)
            importableCount += 1
          }
        }
        const duplicateFile = knownFileHashes.has(preview.sourceHash)
        knownFileHashes.add(preview.sourceHash)
        previews.push({
          ...preview,
          duplicateFile,
          duplicateCount,
          importableCount: duplicateFile && duplicatePolicy === "skip" ? 0 : importableCount,
        })
      } catch (error) {
        failures.push({
          sourceName,
          message: error instanceof Error ? error.message : "The file could not be previewed.",
        })
      }
    }

    return {
      previews,
      failures,
      selectedCount: files.length,
      rowCount: previews.reduce((sum, preview) => sum + preview.rowCount, 0),
      importableCount: previews.reduce((sum, preview) => sum + preview.importableCount, 0),
      duplicateCount: previews.reduce((sum, preview) => sum + preview.duplicateCount, 0),
      invalidRowCount: previews.reduce((sum, preview) => sum + preview.issues.length, 0),
    }
  }

  async commitMany(previews: ImportPreview[]): Promise<{
    receipts: ImportReceipt[]
    failures: { sourceName: string; message: string }[]
  }> {
    const receipts: ImportReceipt[] = []
    const failures: { sourceName: string; message: string }[] = []
    for (const preview of previews) {
      if (
        (preview.duplicateFile && preview.duplicatePolicy === "skip") ||
        preview.importableCount === 0
      )
        continue
      try {
        // Files are independent transactions so one invalid file cannot roll back successful files.
        // oxlint-disable-next-line no-await-in-loop
        receipts.push(await this.commit(preview))
      } catch (error) {
        failures.push({
          sourceName: preview.sourceName,
          message: error instanceof Error ? error.message : "The file was not saved.",
        })
      }
    }
    return { receipts, failures }
  }

  async commit(preview: ImportPreview): Promise<ImportReceipt> {
    if (preview.duplicateFile && preview.duplicatePolicy === "skip") {
      throw new Error("This exact file was already imported.")
    }
    if (preview.importableCount === 0) throw new Error("There are no new valid rows to import.")

    const batchId = identifier()
    const importedAt = new Date().toISOString()
    const transactionCandidates = await Promise.all(
      preview.transactions.map(async (draft) => ({
        draft,
        fingerprint: await transactionFingerprint(draft),
      })),
    )
    const wealthCandidates = await Promise.all(
      preview.wealth.map(async (draft) => ({
        draft,
        fingerprint: await wealthFingerprint(draft.series, draft.date, draft.valueMinor),
      })),
    )
    const result = await this.db.transaction(
      "rw",
      [this.db.transactions, this.db.wealth, this.db.imports],
      async () => {
        if (
          preview.duplicatePolicy === "skip" &&
          (await this.db.imports.where("sourceHash").equals(preview.sourceHash).count()) > 0
        ) {
          throw new Error("This exact file was already imported.")
        }

        let importedCount = 0
        let replacedCount = 0
        let duplicateCount = 0

        if (preview.kind === "transactions") {
          const storedTransactions = await this.db.transactions.toArray()
          // Web Crypto promises are not IndexedDB requests, so explicitly keep the
          // Dexie transaction alive while normalizing fingerprints for legacy rows.
          const known = new Set(
            await Dexie.waitFor(Promise.all(storedTransactions.map(transactionFingerprint))),
          )
          const rows: Transaction[] = []
          for (const { draft, fingerprint } of transactionCandidates) {
            if (known.has(fingerprint) && preview.duplicatePolicy === "skip") {
              duplicateCount += 1
              continue
            }
            known.add(fingerprint)
            rows.push({
              ...draft,
              id: identifier(),
              importBatchId: batchId,
              fingerprint,
              createdAt: importedAt,
              updatedAt: importedAt,
            })
          }
          if (rows.length) await this.db.transactions.bulkAdd(rows)
          importedCount = rows.length
        } else {
          for (const { draft, fingerprint } of wealthCandidates) {
            // oxlint-disable-next-line no-await-in-loop -- Same-date decisions are order dependent.
            const existing = await this.db.wealth
              .where("[series+date]")
              .equals([draft.series, draft.date])
              .first()
            if (existing?.valueMinor === draft.valueMinor) {
              duplicateCount += 1
              continue
            }
            if (existing && preview.wealthPolicy === "skip") {
              duplicateCount += 1
              continue
            }
            const snapshot: WealthSnapshot = {
              ...draft,
              id: existing?.id ?? identifier(),
              importBatchId: batchId,
              fingerprint,
              createdAt: importedAt,
            }
            // oxlint-disable-next-line no-await-in-loop -- Preserve source order for same-date rows.
            await this.db.wealth.put(snapshot)
            importedCount += 1
            if (existing) replacedCount += 1
          }
        }

        if (importedCount === 0) throw new Error("There are no new valid rows to import.")

        const batch: ImportBatch = {
          id: batchId,
          kind: preview.kind,
          sourceName: preview.sourceName,
          sourceHash: preview.sourceHash,
          rowCount: preview.rowCount,
          importedCount,
          skippedCount:
            preview.issues.length + (preview.duplicatePolicy === "skip" ? duplicateCount : 0),
          replacedCount,
          importedAt,
        }
        await this.db.imports.add(batch)
        return batch
      },
    )

    return { batch: result }
  }

  async deleteBatch(batchId: string): Promise<ImportDeletionReceipt> {
    return this.db.transaction(
      "rw",
      [this.db.transactions, this.db.wealth, this.db.imports],
      async () => {
        const batch = await this.db.imports.get(batchId)
        if (!batch) throw new Error("Import not found.")

        const transactionRows = this.db.transactions.where("importBatchId").equals(batchId)
        const wealthRows = this.db.wealth.where("importBatchId").equals(batchId)
        const [deletedTransactionCount, deletedWealthCount] = await Promise.all([
          transactionRows.count(),
          wealthRows.count(),
        ])

        await transactionRows.delete()
        await wealthRows.delete()
        await this.db.imports.delete(batchId)

        return { batch, deletedTransactionCount, deletedWealthCount }
      },
    )
  }
}

export const importService = new ImportService()
