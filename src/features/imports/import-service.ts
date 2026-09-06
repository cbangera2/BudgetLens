import Dexie from "dexie"

import type { BudgetLensDatabase } from "@/db/database"
import { database } from "@/db/database"
import type {
  ImportBatch,
  Transaction,
  TransactionDraft,
  WealthAccountSnapshot,
  WealthAccountSnapshotDraft,
  WealthBreakdownSnapshot,
  WealthBreakdownSnapshotDraft,
  WealthSnapshot,
} from "@/domain/models"
import { DEFAULT_SHARE_COUNT } from "@/domain/models"
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
import { applyTransactionRulesToDrafts } from "@/features/rules/matcher"
import {
  loadTransactionRulesFromDefaultStorage,
  type TransactionRule,
} from "@/features/rules/model"

function resolveTransactionRules(explicit?: readonly TransactionRule[]): TransactionRule[] {
  if (explicit) return [...explicit]
  try {
    return loadTransactionRulesFromDefaultStorage()
  } catch {
    return []
  }
}

function identifier(): string {
  return globalThis.crypto.randomUUID()
}

function snapshotSignature(valueMinor: number, descriptor: string | null): string {
  return `${valueMinor}\0${descriptor ?? ""}`
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

function wealthBreakdownFingerprint(draft: WealthBreakdownSnapshotDraft): Promise<string> {
  return digest(
    JSON.stringify([draft.date, draft.section, draft.segment, draft.valueMinor, draft.descriptor]),
  )
}

function wealthAccountFingerprint(draft: WealthAccountSnapshotDraft): Promise<string> {
  return digest(
    JSON.stringify([
      draft.date,
      draft.accountType,
      draft.sourceLabel,
      draft.valueMinor,
      draft.descriptor,
    ]),
  )
}

export class ImportService {
  constructor(private readonly db: BudgetLensDatabase = database) {}

  async preview(
    content: string,
    sourceName: string,
    wealthPolicy: WealthConflictPolicy = "skip",
    duplicatePolicy: DuplicatePolicy = "skip",
    rules?: readonly TransactionRule[],
  ): Promise<ImportPreview> {
    const parsed = await parseImportContent(content, sourceName)
    const effectiveRules = resolveTransactionRules(rules)
    const ruleResult = applyTransactionRulesToDrafts(effectiveRules, parsed.transactions)
    const ruleTransactions = ruleResult.applied
    // Duplicate fingerprints intentionally include the rule-applied category, matching the
    // existing category-in-fingerprint semantics (manual category edits also change identity).
    // Exact-file re-imports remain blocked by sourceHash regardless of rules.
    const ruleApplications = ruleTransactions.map((_, index) => ({
      originalCategory: ruleResult.originalCategories[index] ?? null,
      matchedRuleId: ruleResult.matchedRuleIds[index] ?? null,
    }))
    const ruleAppliedCount = ruleResult.matchedRuleIds.filter(
      (id): id is string => id !== null,
    ).length
    const effectiveDuplicatePolicy: DuplicatePolicy =
      parsed.kind === "transactions" || parsed.kind === "bundle" ? duplicatePolicy : "skip"
    const duplicateFile =
      (await this.db.imports.where("sourceHash").equals(parsed.sourceHash).count()) > 0
    let duplicateCount = 0
    let replacementCount = 0
    let importableCount = 0

    if (parsed.kind === "bundle") {
      const existingTransactions = new Set(
        await Promise.all((await this.db.transactions.toArray()).map(transactionFingerprint)),
      )
      const transactionFingerprints = await Promise.all(
        ruleTransactions.map(transactionFingerprint),
      )
      for (const fingerprint of transactionFingerprints) {
        if (existingTransactions.has(fingerprint)) {
          duplicateCount += 1
          if (effectiveDuplicatePolicy === "include") importableCount += 1
        } else {
          existingTransactions.add(fingerprint)
          importableCount += 1
        }
      }

      const existingWealth = new Map(
        (await this.db.wealth.toArray()).map((row) => [
          `${row.series}\0${row.date}`,
          row.valueMinor,
        ]),
      )
      for (const draft of parsed.wealth) {
        const key = `${draft.series}\0${draft.date}`
        const prior = existingWealth.get(key)
        if (prior === draft.valueMinor) duplicateCount += 1
        else if (prior !== undefined) {
          if (wealthPolicy === "replace") {
            replacementCount += 1
            importableCount += 1
            existingWealth.set(key, draft.valueMinor)
          } else duplicateCount += 1
        } else {
          existingWealth.set(key, draft.valueMinor)
          importableCount += 1
        }
      }

      const existingBreakdown = new Map(
        (await this.db.wealthBreakdown.toArray()).map((row) => [
          `${row.segment}\0${row.date}`,
          snapshotSignature(row.valueMinor, row.descriptor),
        ]),
      )
      for (const draft of parsed.wealthBreakdown) {
        const key = `${draft.segment}\0${draft.date}`
        const prior = existingBreakdown.get(key)
        if (prior === snapshotSignature(draft.valueMinor, draft.descriptor)) duplicateCount += 1
        else if (prior !== undefined) {
          if (wealthPolicy === "replace") {
            replacementCount += 1
            importableCount += 1
            existingBreakdown.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          } else duplicateCount += 1
        } else {
          existingBreakdown.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          importableCount += 1
        }
      }

      const existingAccounts = new Map(
        (await this.db.wealthAccounts.toArray()).map((row) => [
          `${row.accountType}\0${row.sourceLabel}\0${row.date}`,
          snapshotSignature(row.valueMinor, row.descriptor),
        ]),
      )
      for (const draft of parsed.wealthAccounts) {
        const key = `${draft.accountType}\0${draft.sourceLabel}\0${draft.date}`
        const prior = existingAccounts.get(key)
        if (prior === snapshotSignature(draft.valueMinor, draft.descriptor)) duplicateCount += 1
        else if (prior !== undefined) {
          if (wealthPolicy === "replace") {
            replacementCount += 1
            importableCount += 1
            existingAccounts.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          } else duplicateCount += 1
        } else {
          existingAccounts.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          importableCount += 1
        }
      }
    } else if (parsed.kind === "transactions") {
      const existing = new Set(
        await Promise.all((await this.db.transactions.toArray()).map(transactionFingerprint)),
      )
      const fingerprints = await Promise.all(ruleTransactions.map(transactionFingerprint))
      for (const fingerprint of fingerprints) {
        if (existing.has(fingerprint)) {
          duplicateCount += 1
          if (effectiveDuplicatePolicy === "include") importableCount += 1
        } else {
          existing.add(fingerprint)
          importableCount += 1
        }
      }
    } else if (parsed.kind === "netWorth" || parsed.kind === "investment") {
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
    } else if (parsed.kind === "wealthBreakdown") {
      const existing = new Map(
        (await this.db.wealthBreakdown.toArray()).map((row) => [
          `${row.segment}\0${row.date}`,
          snapshotSignature(row.valueMinor, row.descriptor),
        ]),
      )
      for (const draft of parsed.wealthBreakdown) {
        const key = `${draft.segment}\0${draft.date}`
        const prior = existing.get(key)
        if (prior === snapshotSignature(draft.valueMinor, draft.descriptor)) duplicateCount += 1
        else if (prior !== undefined) {
          if (wealthPolicy === "replace") {
            replacementCount += 1
            importableCount += 1
            existing.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          } else duplicateCount += 1
        } else {
          existing.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          importableCount += 1
        }
      }
    } else {
      const existing = new Map(
        (await this.db.wealthAccounts.toArray()).map((row) => [
          `${row.accountType}\0${row.sourceLabel}\0${row.date}`,
          snapshotSignature(row.valueMinor, row.descriptor),
        ]),
      )
      for (const draft of parsed.wealthAccounts) {
        const key = `${draft.accountType}\0${draft.sourceLabel}\0${draft.date}`
        const prior = existing.get(key)
        if (prior === snapshotSignature(draft.valueMinor, draft.descriptor)) duplicateCount += 1
        else if (prior !== undefined) {
          if (wealthPolicy === "replace") {
            replacementCount += 1
            importableCount += 1
            existing.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          } else duplicateCount += 1
        } else {
          existing.set(key, snapshotSignature(draft.valueMinor, draft.descriptor))
          importableCount += 1
        }
      }
    }

    if (duplicateFile && effectiveDuplicatePolicy === "skip") importableCount = 0

    return {
      ...parsed,
      transactions: ruleTransactions,
      duplicateFile,
      duplicateCount,
      replacementCount,
      importableCount,
      duplicatePolicy: effectiveDuplicatePolicy,
      wealthPolicy,
      ruleApplications,
      ruleAppliedCount,
    }
  }

  async previewMany(
    files: ImportFileInput[],
    duplicatePolicy: DuplicatePolicy = "skip",
    rules?: readonly TransactionRule[],
  ): Promise<ImportCollectionPreview> {
    if (files.length === 0) throw new Error("Select at least one CSV or JSON file.")
    if (files.length > DEFAULT_IMPORT_LIMITS.maxFiles) {
      throw new Error(`Select at most ${DEFAULT_IMPORT_LIMITS.maxFiles} files at once.`)
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
    const knownTransactionFingerprints = new Set(
      await Promise.all((await this.db.transactions.toArray()).map(transactionFingerprint)),
    )
    const knownWealth = new Map(
      (await this.db.wealth.toArray()).map((row) => [`${row.series}\0${row.date}`, row.valueMinor]),
    )
    const knownBreakdown = new Map(
      (await this.db.wealthBreakdown.toArray()).map((row) => [
        `${row.segment}\0${row.date}`,
        row.valueMinor,
      ]),
    )
    const knownAccounts = new Map(
      (await this.db.wealthAccounts.toArray()).map((row) => [
        `${row.accountType}\0${row.sourceLabel}\0${row.date}`,
        row.valueMinor,
      ]),
    )
    const knownFileHashes = new Set(
      (await this.db.imports.toArray()).map((batch) => batch.sourceHash),
    )
    const effectiveRules = resolveTransactionRules(rules)

    for (const file of files) {
      const sourceName = sanitizeImportSourceName(file.sourceName)
      try {
        // Sequential work keeps the displayed duplicate counts deterministic across files.
        // oxlint-disable-next-line no-await-in-loop
        const preview = await this.preview(
          file.content,
          sourceName,
          "skip",
          duplicatePolicy,
          effectiveRules,
        )
        let duplicateCount = 0
        let importableCount = 0

        // oxlint-disable-next-line no-await-in-loop -- Preserve deterministic cross-file ordering.
        const transactionFingerprints = await Promise.all(
          preview.transactions.map(transactionFingerprint),
        )
        for (const fingerprint of transactionFingerprints) {
          if (knownTransactionFingerprints.has(fingerprint)) {
            duplicateCount += 1
            if (preview.duplicatePolicy === "include") importableCount += 1
          } else {
            knownTransactionFingerprints.add(fingerprint)
            importableCount += 1
          }
        }

        for (const draft of preview.wealth) {
          const key = `${draft.series}\0${draft.date}`
          const prior = knownWealth.get(key)
          if (prior !== undefined) duplicateCount += 1
          else {
            knownWealth.set(key, draft.valueMinor)
            importableCount += 1
          }
        }

        for (const draft of preview.wealthBreakdown) {
          const key = `${draft.segment}\0${draft.date}`
          const prior = knownBreakdown.get(key)
          if (prior !== undefined) duplicateCount += 1
          else {
            knownBreakdown.set(key, draft.valueMinor)
            importableCount += 1
          }
        }

        for (const draft of preview.wealthAccounts) {
          const key = `${draft.accountType}\0${draft.sourceLabel}\0${draft.date}`
          const prior = knownAccounts.get(key)
          if (prior !== undefined) duplicateCount += 1
          else {
            knownAccounts.set(key, draft.valueMinor)
            importableCount += 1
          }
        }

        const duplicateFile = knownFileHashes.has(preview.sourceHash)
        knownFileHashes.add(preview.sourceHash)
        previews.push({
          ...preview,
          duplicateFile,
          duplicateCount,
          replacementCount: 0,
          importableCount:
            duplicateFile && preview.duplicatePolicy === "skip" ? 0 : importableCount,
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
    const wealthBreakdownCandidates = await Promise.all(
      preview.wealthBreakdown.map(async (draft) => ({
        draft,
        fingerprint: await wealthBreakdownFingerprint(draft),
      })),
    )
    const wealthAccountCandidates = await Promise.all(
      preview.wealthAccounts.map(async (draft) => ({
        draft,
        fingerprint: await wealthAccountFingerprint(draft),
      })),
    )
    const result = await this.db.transaction(
      "rw",
      [
        this.db.transactions,
        this.db.wealth,
        this.db.wealthBreakdown,
        this.db.wealthAccounts,
        this.db.imports,
      ],
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

        if (preview.kind === "transactions" || preview.kind === "bundle") {
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
              groupId: draft.groupId ?? null,
              shared: draft.shared ?? false,
              shareCount: draft.shareCount ?? DEFAULT_SHARE_COUNT,
              id: identifier(),
              importBatchId: batchId,
              fingerprint,
              createdAt: importedAt,
              updatedAt: importedAt,
            })
          }
          if (rows.length) await this.db.transactions.bulkAdd(rows)
          importedCount = rows.length
        }
        if (
          preview.kind === "netWorth" ||
          preview.kind === "investment" ||
          preview.kind === "bundle"
        ) {
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
        if (preview.kind === "wealthBreakdown" || preview.kind === "bundle") {
          for (const { draft, fingerprint } of wealthBreakdownCandidates) {
            // oxlint-disable-next-line no-await-in-loop -- Same-date decisions are order dependent.
            const existing = await this.db.wealthBreakdown
              .where("[segment+date]")
              .equals([draft.segment, draft.date])
              .first()
            if (
              existing?.valueMinor === draft.valueMinor &&
              existing.descriptor === draft.descriptor
            ) {
              duplicateCount += 1
              continue
            }
            if (existing && preview.wealthPolicy === "skip") {
              duplicateCount += 1
              continue
            }
            const snapshot: WealthBreakdownSnapshot = {
              ...draft,
              id: existing?.id ?? identifier(),
              importBatchId: batchId,
              fingerprint,
              createdAt: importedAt,
            }
            // oxlint-disable-next-line no-await-in-loop -- Preserve source order for same-date rows.
            await this.db.wealthBreakdown.put(snapshot)
            importedCount += 1
            if (existing) replacedCount += 1
          }
        }
        if (preview.kind === "wealthAccounts" || preview.kind === "bundle") {
          for (const { draft, fingerprint } of wealthAccountCandidates) {
            // oxlint-disable-next-line no-await-in-loop -- Same-account decisions are order dependent.
            const existing = await this.db.wealthAccounts
              .where("[accountType+sourceLabel+date]")
              .equals([draft.accountType, draft.sourceLabel, draft.date])
              .first()
            if (
              existing?.valueMinor === draft.valueMinor &&
              existing.descriptor === draft.descriptor
            ) {
              duplicateCount += 1
              continue
            }
            if (existing && preview.wealthPolicy === "skip") {
              duplicateCount += 1
              continue
            }
            const snapshot: WealthAccountSnapshot = {
              ...draft,
              id: existing?.id ?? identifier(),
              importBatchId: batchId,
              fingerprint,
              createdAt: importedAt,
            }
            // oxlint-disable-next-line no-await-in-loop -- Preserve source order for same-account rows.
            await this.db.wealthAccounts.put(snapshot)
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
      [
        this.db.transactions,
        this.db.wealth,
        this.db.wealthBreakdown,
        this.db.wealthAccounts,
        this.db.imports,
      ],
      async () => {
        const batch = await this.db.imports.get(batchId)
        if (!batch) throw new Error("Import not found.")

        const transactionRows = this.db.transactions.where("importBatchId").equals(batchId)
        const wealthRows = this.db.wealth.where("importBatchId").equals(batchId)
        const breakdownRows = this.db.wealthBreakdown.where("importBatchId").equals(batchId)
        const accountRows = this.db.wealthAccounts.where("importBatchId").equals(batchId)
        const [
          deletedTransactionCount,
          deletedWealthCount,
          deletedWealthBreakdownCount,
          deletedWealthAccountCount,
        ] = await Promise.all([
          transactionRows.count(),
          wealthRows.count(),
          breakdownRows.count(),
          accountRows.count(),
        ])

        await transactionRows.delete()
        await wealthRows.delete()
        await breakdownRows.delete()
        await accountRows.delete()
        await this.db.imports.delete(batchId)

        return {
          batch,
          deletedTransactionCount,
          deletedWealthCount,
          deletedWealthBreakdownCount,
          deletedWealthAccountCount,
        }
      },
    )
  }
}

export const importService = new ImportService()
