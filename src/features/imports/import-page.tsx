import { useEffect, useId, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import type { ImportBatch } from "@/domain/models"
import { useIsDemoData } from "@/features/demo/demo-seed"
import { isDemoSourceName } from "@/features/demo/demo-templates"
import type { CsvColumnMapping, CsvMappableField } from "@/features/imports/csv-mapping"
import {
  CSV_MAPPABLE_FIELDS,
  missingRequiredCsvFields,
  suggestCsvMapping,
  validateCsvMapping,
} from "@/features/imports/csv-mapping"
import { importService } from "@/features/imports/import-service"
import type { MappingProfileInput, RankedMappingProfile } from "@/features/imports/mapping-profiles"
import {
  applyMappingProfileToHeaders,
  resolveMappingProfileForHeaders,
  suggestMappingProfileName,
  useMappingProfiles,
} from "@/features/imports/mapping-profiles"
import { MappingProfilesSection } from "@/features/imports/mapping-profiles-section"
import {
  importFileType,
  isUnsupportedHeadersError,
  readCsvHeaders,
  sanitizeImportSourceName,
} from "@/features/imports/parser"
import {
  DEFAULT_IMPORT_LIMITS,
  type DuplicatePolicy,
  type ImportCollectionPreview,
  type ImportFileFailure,
  type ImportFileInput,
  type ImportLimits,
  type ImportPreview,
} from "@/features/imports/types"
import { RulesSection } from "@/features/rules/rules-section"
import { useTransactionRules } from "@/features/rules/store"
import { transactionsByImportBatchPath } from "@/features/transactions/links"

function kindLabel(kind: ImportBatch["kind"]): string {
  if (kind === "bundle") return "BudgetLens bundle"
  if (kind === "netWorth") return "Net worth"
  if (kind === "investment") return "Investments"
  if (kind === "wealthBreakdown") return "Net worth breakdown"
  if (kind === "wealthAccounts") return "Wealth accounts"
  return "Transactions"
}

function isTransactionCapableKind(kind: ImportBatch["kind"]): boolean {
  return kind === "transactions" || kind === "bundle"
}

function useReturnFocusOnClose(open: boolean) {
  const savedRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      savedRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    } else if (!open && wasOpenRef.current) {
      const target = savedRef.current
      savedRef.current = null
      if (target && target.isConnected) {
        requestAnimationFrame(() => target.focus())
      }
    }
    wasOpenRef.current = open
  }, [open])
}

function formatPreviewAmountMinor(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : ""
  const absolute = Math.abs(amountMinor)
  const dollars = Math.floor(absolute / 100).toLocaleString("en-US")
  const cents = (absolute % 100).toString().padStart(2, "0")
  return `${sign}$${dollars}.${cents}`
}

const mappingSelectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface PendingMappingFile {
  file: File
  content: string
  headers: string[]
  message: string
}

function toMappingSelectState(mapping: CsvColumnMapping): Record<CsvMappableField, string> {
  return {
    date: mapping.date ?? "",
    amount: mapping.amount ?? "",
    description: mapping.description ?? "",
    category: mapping.category ?? "",
    account: mapping.account ?? "",
    type: mapping.type ?? "",
  }
}

function toCsvColumnMapping(state: Record<CsvMappableField, string>): CsvColumnMapping {
  return {
    date: state.date.trim() ? state.date : null,
    amount: state.amount.trim() ? state.amount : null,
    description: state.description.trim() ? state.description : null,
    category: state.category.trim() ? state.category : null,
    account: state.account.trim() ? state.account : null,
    type: state.type.trim() ? state.type : null,
  }
}

interface ReadableImportFile {
  name: string
  size: number
  text: () => Promise<string>
}

export async function readFilesIndependently(
  files: readonly ReadableImportFile[],
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
  onProgress?: (completed: number, total: number) => void,
): Promise<{ inputs: ImportFileInput[]; failures: ImportFileFailure[] }> {
  const inputs: ImportFileInput[] = []
  const failures: ImportFileFailure[] = []
  let acceptedBytes = 0

  for (const [index, file] of files.entries()) {
    const sourceName = sanitizeImportSourceName(file.name)
    if (file.size > limits.maxFileBytes) {
      failures.push({
        sourceName,
        message: `File exceeds the ${limits.maxFileBytes.toLocaleString()} byte per-file limit.`,
      })
      onProgress?.(index + 1, files.length)
      continue
    }
    if (acceptedBytes + file.size > limits.maxTotalBytes) {
      failures.push({
        sourceName,
        message: `File exceeds the remaining ${limits.maxTotalBytes.toLocaleString()} byte combined limit.`,
      })
      onProgress?.(index + 1, files.length)
      continue
    }

    try {
      // Read each file independently so one browser/file-system failure cannot abort the batch.
      // oxlint-disable-next-line no-await-in-loop
      const content = await file.text()
      const contentBytes = new TextEncoder().encode(content).byteLength
      if (contentBytes > limits.maxFileBytes) {
        failures.push({
          sourceName,
          message: `File exceeds the ${limits.maxFileBytes.toLocaleString()} byte per-file limit.`,
        })
      } else if (acceptedBytes + contentBytes > limits.maxTotalBytes) {
        failures.push({
          sourceName,
          message: `File exceeds the remaining ${limits.maxTotalBytes.toLocaleString()} byte combined limit.`,
        })
      } else {
        acceptedBytes += contentBytes
        inputs.push({ content, sourceName })
      }
    } catch {
      failures.push({ sourceName, message: "The file could not be read." })
    }
    onProgress?.(index + 1, files.length)
  }

  return { inputs, failures }
}

export function ImportPage() {
  const inputId = useId()
  const demoPresent = useIsDemoData()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [collection, setCollection] = useState<ImportCollectionPreview | null>(null)
  const [history, setHistory] = useState<ImportBatch[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip")
  const [deletingBatch, setDeletingBatch] = useState<ImportBatch | null>(null)
  const [resultFailures, setResultFailures] = useState<ImportFileFailure[]>([])
  const [status, setStatus] = useState("")
  const [importError, setImportError] = useState("")
  const [busy, setBusy] = useState(false)
  const [rules, ruleActions] = useTransactionRules()
  const [categoryOverrides, setCategoryOverrides] = useState<Record<number, string>>({})
  const [mappingFile, setMappingFile] = useState<PendingMappingFile | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<CsvMappableField, string>>({
    date: "",
    amount: "",
    description: "",
    category: "",
    account: "",
    type: "",
  })
  const [mappingError, setMappingError] = useState("")
  const [rememberMapping, setRememberMapping] = useState(false)
  const [profileName, setProfileName] = useState("")
  const [appliedProfileId, setAppliedProfileId] = useState<string | null>(null)
  const [fuzzyCandidates, setFuzzyCandidates] = useState<RankedMappingProfile[]>([])
  const [fuzzyDismissed, setFuzzyDismissed] = useState(false)
  const [profiles, profileActions] = useMappingProfiles()
  const [lastImportedBatches, setLastImportedBatches] = useState<
    { id: string; sourceName: string; kind: ImportBatch["kind"] }[]
  >([])

  useEffect(() => {
    void repositories.imports.list().then(setHistory)
  }, [])
  useReturnFocusOnClose(deletingBatch !== null)

  function previewWithOverrides(source: ImportPreview): ImportPreview {
    const indices = Object.keys(categoryOverrides)
    if (indices.length === 0) return source
    return {
      ...source,
      transactions: source.transactions.map((draft, index) => {
        const override = categoryOverrides[index]
        if (override === undefined) return draft
        const trimmed = override.trim()
        return { ...draft, category: trimmed ? trimmed : null }
      }),
    }
  }

  async function selectFiles(files: File[], policy = duplicatePolicy, effectiveRules = rules) {
    setPreview(null)
    setCollection(null)
    setCategoryOverrides({})
    setMappingFile(null)
    setMappingError("")
    setRememberMapping(false)
    setProfileName("")
    setAppliedProfileId(null)
    setFuzzyCandidates([])
    setFuzzyDismissed(false)
    setResultFailures([])
    setStatus("")
    setLastImportedBatches([])
    setImportError("")
    setSelectedFile(null)
    setSelectedFiles(files)
    if (files.length === 0) return
    const fileTypes = files.map((file) => importFileType(file.name))
    if (fileTypes.some((type) => type === null)) {
      setImportError("Unsupported file type. Select .csv or .json files.")
      return
    }
    if (files.length > DEFAULT_IMPORT_LIMITS.maxFiles) {
      setImportError(`Select at most ${DEFAULT_IMPORT_LIMITS.maxFiles} files at once.`)
      return
    }
    setBusy(true)
    try {
      if (files.length === 1) {
        const file = files[0]!
        if (file.size > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
          setImportError("The selected file exceeds the 10 MB per-file limit.")
          return
        }
        setStatus("Reading and validating the selected file…")
        setSelectedFile(file)
        let content: string
        try {
          content = await file.text()
        } catch {
          setImportError("The file could not be read.")
          return
        }
        try {
          const next = await importService.preview(
            content,
            file.name,
            "skip",
            policy,
            effectiveRules,
          )
          setPreview(next)
          setCategoryOverrides({})
          setStatus(
            next.duplicateFile && next.duplicatePolicy === "skip"
              ? "This exact file was already imported. Nothing will be written."
              : "Preview ready. Review the counts before importing.",
          )
        } catch (error) {
          if (importFileType(file.name) === "csv" && isUnsupportedHeadersError(error)) {
            try {
              const headers = readCsvHeaders(content)
              const message = error instanceof Error ? error.message : "The file could not be read."
              setMappingFile({ file, content, headers, message })
              const resolution = resolveMappingProfileForHeaders(profiles, headers)
              if (resolution.kind === "exact") {
                setColumnMapping(applyMappingProfileToHeaders(resolution.profile, headers))
                setAppliedProfileId(resolution.profile.id)
                setFuzzyCandidates([])
                setStatus(
                  `Applied saved mapping profile “${resolution.profile.name}”. Adjust any column, then preview.`,
                )
              } else {
                setColumnMapping(toMappingSelectState(suggestCsvMapping(headers)))
                setAppliedProfileId(null)
                setFuzzyCandidates(resolution.kind === "suggest" ? resolution.suggestions : [])
                setStatus(
                  "This CSV uses unfamiliar headers. Map each field to a column, then preview.",
                )
              }
              setFuzzyDismissed(false)
              setRememberMapping(false)
              setProfileName(suggestMappingProfileName(file.name))
              setMappingError("")
              return
            } catch {
              setImportError(error instanceof Error ? error.message : "The file could not be read.")
              return
            }
          }
          setImportError(error instanceof Error ? error.message : "The file could not be read.")
          return
        }
      } else {
        setStatus(`Reading file 0 of ${files.length.toLocaleString()}…`)
        const read = await readFilesIndependently(files, DEFAULT_IMPORT_LIMITS, (done, total) =>
          setStatus(`Reading file ${done.toLocaleString()} of ${total.toLocaleString()}…`),
        )
        setStatus(`Parsing ${read.inputs.length.toLocaleString()} readable file(s)…`)
        const parsed =
          read.inputs.length > 0
            ? await importService.previewMany(read.inputs, policy, effectiveRules)
            : {
                previews: [],
                failures: [],
                selectedCount: 0,
                rowCount: 0,
                importableCount: 0,
                duplicateCount: 0,
                invalidRowCount: 0,
              }
        const next: ImportCollectionPreview = {
          ...parsed,
          selectedCount: files.length,
          failures: [...read.failures, ...parsed.failures],
        }
        setCollection(next)
        setStatus(
          next.failures.length > 0
            ? `${next.previews.length.toLocaleString()} file(s) are ready; ${next.failures.length.toLocaleString()} file(s) are invalid and will not be imported.`
            : "All selected files are ready. Review each result before importing.",
        )
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The file could not be read.")
    } finally {
      setBusy(false)
    }
  }

  async function confirmCollection() {
    if (!collection) return
    setBusy(true)
    try {
      const result = await importService.commitMany(collection.previews)
      setHistory(await repositories.imports.list())
      const failures = [...collection.failures, ...result.failures]
      setResultFailures(failures)
      setCollection(null)
      const importedRows = result.receipts.reduce(
        (sum, receipt) => sum + receipt.batch.importedCount,
        0,
      )
      setLastImportedBatches(
        result.receipts.map((receipt) => ({
          id: receipt.batch.id,
          sourceName: receipt.batch.sourceName,
          kind: receipt.batch.kind,
        })),
      )
      setStatus(
        failures.length > 0
          ? `Imported ${importedRows.toLocaleString()} rows from ${result.receipts.length.toLocaleString()} files. ${failures.length.toLocaleString()} selected file(s) were not imported.`
          : `Imported ${importedRows.toLocaleString()} rows from ${result.receipts.length.toLocaleString()} files.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The imports were not saved.")
    } finally {
      setBusy(false)
    }
  }

  async function changePolicy(policy: "skip" | "replace") {
    if (!preview) return
    setBusy(true)
    try {
      if (!selectedFile) return
      setPreview(
        await importService.preview(
          await selectedFile.text(),
          selectedFile.name,
          policy,
          duplicatePolicy,
          rules,
        ),
      )
      setCategoryOverrides({})
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The preview could not be updated.")
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    if (!preview) return
    setBusy(true)
    try {
      const receipt = await importService.commit(previewWithOverrides(preview))
      setHistory(await repositories.imports.list())
      setPreview(null)
      setCategoryOverrides({})
      setHistory(await repositories.imports.list())
      setPreview(null)
      setLastImportedBatches([
        {
          id: receipt.batch.id,
          sourceName: receipt.batch.sourceName,
          kind: receipt.batch.kind,
        },
      ])
      setStatus(
        `Imported ${receipt.batch.importedCount.toLocaleString()} ${kindLabel(receipt.batch.kind).toLocaleLowerCase()} row${receipt.batch.importedCount === 1 ? "" : "s"}.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The import was not saved.")
    } finally {
      setBusy(false)
    }
  }

  async function changeDuplicatePolicy(policy: DuplicatePolicy) {
    setDuplicatePolicy(policy)
    if (selectedFiles.length > 0) await selectFiles(selectedFiles, policy, rules)
  }

  async function previewWithMapping() {
    if (!mappingFile) return
    const pending = mappingFile
    const mapping = toCsvColumnMapping(columnMapping)
    const failure = validateCsvMapping(mapping)
    if (failure) {
      setMappingError(failure)
      return
    }
    if (rememberMapping && !profileName.trim()) {
      setMappingError("Enter a profile name or uncheck “Remember for files like this”.")
      return
    }
    setBusy(true)
    setMappingError("")
    try {
      const next = await importService.preview(
        pending.content,
        pending.file.name,
        "skip",
        duplicatePolicy,
        rules,
        mapping,
      )
      let savedProfileName: string | null = null
      if (rememberMapping) {
        const input: MappingProfileInput = {
          name: profileName,
          headers: pending.headers,
          mapping,
          sourceFileName: pending.file.name,
        }
        const saved = profileActions.saveProfile(input)
        if (saved) {
          savedProfileName = saved.name
          setAppliedProfileId(saved.id)
        }
      }
      setPreview(next)
      setCategoryOverrides({})
      setMappingFile(null)
      setRememberMapping(false)
      setFuzzyCandidates([])
      setStatus(
        savedProfileName
          ? `Preview ready. Review the counts before importing. Saved mapping profile “${savedProfileName}” for files like this.`
          : "Preview ready. Review the counts before importing.",
      )
    } catch (error) {
      setMappingError(error instanceof Error ? error.message : "The file could not be read.")
    } finally {
      setBusy(false)
    }
  }

  function applyFuzzySuggestion(candidate: RankedMappingProfile) {
    if (!mappingFile) return
    setColumnMapping(applyMappingProfileToHeaders(candidate.profile, mappingFile.headers))
    setAppliedProfileId(candidate.profile.id)
    setFuzzyCandidates([])
    setFuzzyDismissed(true)
    setStatus(
      `Applied saved mapping profile “${candidate.profile.name}”. Adjust any column, then preview.`,
    )
  }

  function clearAppliedProfile() {
    if (!mappingFile) return
    setAppliedProfileId(null)
    setColumnMapping(toMappingSelectState(suggestCsvMapping(mappingFile.headers)))
  }

  function cancelMapping() {
    if (!mappingFile) return
    setImportError(mappingFile.message)
    setMappingFile(null)
    setMappingError("")
    setRememberMapping(false)
    setProfileName("")
    setAppliedProfileId(null)
    setFuzzyCandidates([])
    setFuzzyDismissed(false)
    setStatus("")
  }

  async function deleteImportBatch() {
    if (!deletingBatch) return
    setBusy(true)
    try {
      const receipt = await importService.deleteBatch(deletingBatch.id)
      setHistory(await repositories.imports.list())
      const removedId = deletingBatch.id
      setDeletingBatch(null)
      setLastImportedBatches((current) => current.filter((entry) => entry.id !== removedId))
      const deletedCount =
        receipt.deletedTransactionCount +
        receipt.deletedWealthCount +
        receipt.deletedWealthBreakdownCount +
        receipt.deletedWealthAccountCount
      setStatus(
        `Removed ${deletedCount.toLocaleString()} stored row${deletedCount === 1 ? "" : "s"} from ${receipt.batch.sourceName}.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The import could not be removed.")
    } finally {
      setBusy(false)
    }
  }

  const appliedProfile = mappingFile
    ? (profiles.find((profile) => profile.id === appliedProfileId) ?? null)
    : null
  const showFuzzySuggestions =
    mappingFile !== null && appliedProfile === null && !fuzzyDismissed && fuzzyCandidates.length > 0

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Private by default</p>
        <h1 className="text-3xl font-semibold tracking-tight">Import Credit Karma data</h1>
        <p className="max-w-2xl text-muted-foreground">
          Preview transactions, wealth history, net worth breakdowns, or account snapshots before
          saving them in this browser. File contents never become part of import history.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Select Credit Karma exports</CardTitle>
          <CardDescription>
            Import BudgetLens bundles, CSV exports, and transaction JSON responses together.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Duplicate transactions</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-0.5"
                type="checkbox"
                checked={duplicatePolicy === "skip"}
                disabled={busy}
                onChange={(event) =>
                  void changeDuplicatePolicy(event.currentTarget.checked ? "skip" : "include")
                }
              />
              <span>
                Skip duplicate rows <span className="text-muted-foreground">(recommended)</span>
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              {duplicatePolicy === "skip"
                ? "Rows already stored in this browser, including rows from another selected file, will not be imported again."
                : "Duplicate rows will be imported intentionally and remain tied to this import so they can be removed separately."}
            </p>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={inputId}>CSV or JSON files</Label>
            <Input
              id={inputId}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              multiple
              disabled={busy}
              aria-invalid={Boolean(importError)}
              aria-describedby={`${inputId}-help${importError ? ` ${inputId}-error` : ""}`}
              onChange={(event) => void selectFiles([...(event.currentTarget.files ?? [])])}
            />
            <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
              Select up to 20 CSV and JSON files in any combination. Each file is detected,
              validated, and imported independently. Maximum 10 MB and 100,000 rows per file; 50 MB
              total.
            </p>
          </div>
          {importError ? (
            <div
              id={`${inputId}-error`}
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p className="font-medium">Those files cannot be imported together</p>
              <p className="mt-1">{importError}</p>
            </div>
          ) : null}
          <output aria-live="polite" className="block text-sm">
            {status || (busy ? "Reading and validating the file…" : "")}
          </output>
          {lastImportedBatches.some((batch) => isTransactionCapableKind(batch.kind)) ? (
            <div className="flex flex-wrap gap-2">
              {lastImportedBatches
                .filter((batch) => isTransactionCapableKind(batch.kind))
                .map((batch) => (
                  <Button key={batch.id} variant="outline" size="sm" asChild>
                    <a href={transactionsByImportBatchPath(batch.id)}>View {batch.sourceName}</a>
                  </Button>
                ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RulesSection rules={rules} actions={ruleActions} />

      {resultFailures.length > 0 ? (
        <Card className="border-destructive/50" aria-labelledby="import-result-errors">
          <CardHeader>
            <CardTitle id="import-result-errors">Files not imported</CardTitle>
            <CardDescription>Other valid files were saved independently.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-destructive">
              {resultFailures.map((failure) => (
                <li key={`${failure.sourceName}-${failure.message}`}>
                  <span className="font-medium">{failure.sourceName}:</span> {failure.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {collection ? (
        <Card aria-labelledby="collection-import-preview-title">
          <CardHeader>
            <CardTitle id="collection-import-preview-title">Multi-file import preview</CardTitle>
            <CardDescription>
              {collection.selectedCount.toLocaleString()} selected file(s). Invalid files remain
              excluded unless you fix and select them again. Duplicate rows are
              {duplicatePolicy === "skip" ? " skipped." : " included intentionally."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {demoPresent &&
            collection.previews.some((item) => !isDemoSourceName(item.sourceName)) ? (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Importing will replace the sample demo data currently shown.
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Rows</dt>
                <dd className="text-xl font-semibold">{collection.rowCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ready</dt>
                <dd className="text-xl font-semibold">
                  {collection.importableCount.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Duplicates</dt>
                <dd className="text-xl font-semibold">
                  {collection.duplicateCount.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Invalid</dt>
                <dd className="text-xl font-semibold">
                  {(collection.invalidRowCount + collection.failures.length).toLocaleString()}
                </dd>
              </div>
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Selected file preview results</caption>
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4" scope="col">
                      File
                    </th>
                    <th className="py-2 pr-4" scope="col">
                      Rows
                    </th>
                    <th className="py-2 pr-4" scope="col">
                      Ready
                    </th>
                    <th className="py-2" scope="col">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {collection.previews.map((item) => (
                    <tr className="border-b" key={`${item.sourceHash}-${item.sourceName}`}>
                      <td className="py-3 pr-4">{item.sourceName}</td>
                      <td className="py-3 pr-4">{item.rowCount.toLocaleString()}</td>
                      <td className="py-3 pr-4">{item.importableCount.toLocaleString()}</td>
                      <td className="py-3">
                        {item.duplicateFile && item.duplicatePolicy === "skip"
                          ? "Already imported"
                          : item.issues.length > 0
                            ? `${item.issues.length.toLocaleString()} invalid row(s)`
                            : "Ready"}
                        {(item.ruleAppliedCount ?? 0) > 0
                          ? ` · ${(item.ruleAppliedCount ?? 0).toLocaleString()} row${(item.ruleAppliedCount ?? 0) === 1 ? "" : "s"} matched`
                          : ""}
                      </td>
                    </tr>
                  ))}
                  {collection.failures.map((failure) => (
                    <tr
                      className="border-b text-destructive"
                      key={`${failure.sourceName}-${failure.message}`}
                    >
                      <td className="py-3 pr-4">{failure.sourceName}</td>
                      <td className="py-3 pr-4">—</td>
                      <td className="py-3 pr-4">0</td>
                      <td className="py-3">{failure.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={busy || collection.importableCount === 0}
                onClick={() => void confirmCollection()}
              >
                Import valid files
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCollection(null)}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Transaction rules were applied automatically to transaction files. Open a single file
              to review per-row categories before confirming.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {mappingFile ? (
        <Card aria-labelledby="csv-mapping-title">
          <CardHeader>
            <CardTitle id="csv-mapping-title">Map CSV columns</CardTitle>
            <CardDescription>
              {mappingFile.file.name} uses headers we don&apos;t recognize. Map each field to a
              column, then preview. Extra columns are ignored. Date, Amount, and Description are
              required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {appliedProfile ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm">
                  Using saved profile “{appliedProfile.name}”. Adjust any column below to change it
                  for this file only.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Stop using ${appliedProfile.name}`}
                  onClick={clearAppliedProfile}
                >
                  Remove
                </Button>
              </div>
            ) : null}
            {showFuzzySuggestions ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <p className="text-sm">
                  This file looks like a saved profile, but the headers are not an exact match, so
                  nothing was applied automatically.
                </p>
                <ul className="space-y-2">
                  {fuzzyCandidates.map((candidate) => (
                    <li
                      key={candidate.profile.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        “{candidate.profile.name}” ({candidate.sharedCount} of{" "}
                        {candidate.profileColumnCount +
                          candidate.fileColumnCount -
                          candidate.sharedCount}{" "}
                        columns match)
                      </span>
                      <span className="inline-flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          aria-label={`Apply ${candidate.profile.name}`}
                          onClick={() => applyFuzzySuggestion(candidate)}
                        >
                          Apply profile
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setFuzzyDismissed(true)}
                        >
                          Dismiss
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Found columns: {mappingFile.headers.join(", ")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {CSV_MAPPABLE_FIELDS.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <Label htmlFor={`csv-map-${field.key}`}>
                    {field.label}
                    {field.required ? " (required)" : " (optional)"}
                  </Label>
                  <select
                    id={`csv-map-${field.key}`}
                    className={mappingSelectClass}
                    disabled={busy}
                    value={columnMapping[field.key]}
                    onChange={(event) =>
                      setColumnMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">{field.required ? "Select a column" : "Do not import"}</option>
                    {mappingFile.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {missingRequiredCsvFields(toCsvColumnMapping(columnMapping)).length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Select a column for each required field to continue.
              </p>
            ) : null}
            {mappingError ? (
              <p role="alert" className="text-sm text-destructive">
                {mappingError}
              </p>
            ) : null}
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  checked={rememberMapping}
                  disabled={busy}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    setRememberMapping(checked)
                    if (checked && !profileName.trim() && mappingFile) {
                      setProfileName(suggestMappingProfileName(mappingFile.file.name))
                    }
                  }}
                />
                <span>Remember for files like this</span>
              </label>
              {rememberMapping ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="csv-profile-name">Profile name</Label>
                  <Input
                    id="csv-profile-name"
                    value={profileName}
                    maxLength={80}
                    autoComplete="off"
                    disabled={busy}
                    placeholder="e.g. Odd bank export"
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Future files with exactly these headers will use this mapping automatically.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" disabled={busy} onClick={() => void previewWithMapping()}>
                Preview with mapping
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={cancelMapping}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <MappingProfilesSection profiles={profiles} actions={profileActions} />

      {preview ? (
        <Card aria-labelledby="import-preview-title">
          <CardHeader>
            <CardTitle id="import-preview-title">Import preview</CardTitle>
            <CardDescription>
              {kindLabel(preview.kind)} · {preview.sourceName}
              {preview.kind === "transactions" || preview.kind === "bundle"
                ? ` · Duplicates ${preview.duplicatePolicy === "skip" ? "skipped" : "included"}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {demoPresent && !isDemoSourceName(preview.sourceName) ? (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Importing will replace the sample demo data currently shown.
              </p>
            ) : null}
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Rows</dt>
                <dd className="text-xl font-semibold">{preview.rowCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ready</dt>
                <dd className="text-xl font-semibold">
                  {preview.importableCount.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Duplicates</dt>
                <dd className="text-xl font-semibold">{preview.duplicateCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Invalid</dt>
                <dd className="text-xl font-semibold">{preview.issues.length.toLocaleString()}</dd>
              </div>
            </dl>

            {preview.kind !== "transactions" ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  When the same dated snapshot already has another value
                </legend>
                <label className="mr-5 inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="wealth-policy"
                    value="skip"
                    checked={preview.wealthPolicy === "skip"}
                    onChange={() => void changePolicy("skip")}
                  />
                  Keep existing value
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="wealth-policy"
                    value="replace"
                    checked={preview.wealthPolicy === "replace"}
                    onChange={() => void changePolicy("replace")}
                  />
                  Replace existing value
                </label>
                {preview.replacementCount > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {preview.replacementCount.toLocaleString()} existing value(s) will be replaced.
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            {preview.transactions.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-medium">Transaction categories</h3>
                {(preview.ruleAppliedCount ?? 0) > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {(preview.ruleAppliedCount ?? 0).toLocaleString()} row
                    {(preview.ruleAppliedCount ?? 0) === 1 ? "" : "s"} matched a transaction rule.
                    Categories can still be edited per row before confirming.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No transaction rules matched. Categories can still be edited per row before
                    confirming.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Transaction preview with rule categories</caption>
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 pr-4" scope="col">
                          Date
                        </th>
                        <th className="py-2 pr-4" scope="col">
                          Description
                        </th>
                        <th className="py-2 pr-4" scope="col">
                          Amount
                        </th>
                        <th className="py-2 pr-4" scope="col">
                          Category
                        </th>
                        <th className="py-2" scope="col">
                          Rule
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.transactions.slice(0, 100).map((draft, index) => {
                        const application = preview.ruleApplications?.[index]
                        const matched = Boolean(application?.matchedRuleId)
                        const value = categoryOverrides[index] ?? draft.category ?? ""
                        return (
                          <tr
                            className="border-b"
                            // oxlint-disable-next-line no-array-index-key -- Preview rows may be exact duplicates; source order is the identity.
                            key={`${draft.date}-${draft.description}-${index}`}
                          >
                            <td className="py-2 pr-4 whitespace-nowrap">{draft.date}</td>
                            <td className="py-2 pr-4">{draft.description || "—"}</td>
                            <td className="py-2 pr-4 whitespace-nowrap">
                              {formatPreviewAmountMinor(draft.amountMinor)}
                            </td>
                            <td className="py-2 pr-4">
                              <Input
                                aria-label={`Category for row ${index + 1} ${draft.description}`}
                                className="h-8 min-w-32"
                                autoComplete="off"
                                value={value}
                                disabled={busy}
                                onChange={(event) =>
                                  setCategoryOverrides((current) => ({
                                    ...current,
                                    [index]: event.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="py-2">
                              {matched ? (
                                <span className="inline-flex flex-col gap-1">
                                  <Badge variant="secondary">Rule applied</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    Was: {application?.originalCategory || "—"}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {preview.transactions.length > 100 ? (
                  <p className="text-xs text-muted-foreground">
                    Showing 100 of {preview.transactions.length.toLocaleString()} rows. Remaining
                    rows keep their rule-applied categories.
                  </p>
                ) : null}
              </div>
            ) : null}

            {preview.issues.length ? (
              <div>
                <h3 className="font-medium">Rows that will be skipped</h3>
                <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-sm text-destructive">
                  {preview.issues.slice(0, 100).map((issue) => (
                    <li key={`${issue.row}-${issue.message}`}>
                      {issue.row ? `Row ${issue.row}: ` : ""}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={
                  busy ||
                  (preview.duplicateFile && preview.duplicatePolicy === "skip") ||
                  preview.importableCount === 0
                }
                onClick={() => void confirmImport()}
              >
                Confirm import
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPreview(null)
                  setCategoryOverrides({})
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>
            Metadata only. Original file contents are never stored here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Completed imports</caption>
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="py-2 pr-4">
                      File
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Type
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Imported
                    </th>
                    <th scope="col" className="py-2">
                      Date
                    </th>
                    <th scope="col" className="py-2 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((batch) => (
                    <tr key={batch.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">{batch.sourceName}</td>
                      <td className="py-3 pr-4">{kindLabel(batch.kind)}</td>
                      <td className="py-3 pr-4">{batch.importedCount.toLocaleString()}</td>
                      <td className="py-3 pr-4">{new Date(batch.importedAt).toLocaleString()}</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center justify-end gap-1">
                          {isTransactionCapableKind(batch.kind) ? (
                            <a
                              href={transactionsByImportBatchPath(batch.id)}
                              aria-label={`View ${batch.sourceName} transactions`}
                              className="inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              View
                            </a>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setDeletingBatch(batch)}
                          >
                            Remove
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No completed imports yet. Select CSV or JSON files above to preview your first import.
            </p>
          )}
        </CardContent>
      </Card>

      {deletingBatch ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setDeletingBatch(null)
          }}
        >
          <dialog
            open
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-import-title"
            aria-describedby="delete-import-description"
            className="relative m-0 w-full max-w-md rounded-2xl border bg-background p-0 text-foreground shadow-2xl"
          >
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle id="delete-import-title">Remove this import?</CardTitle>
                <CardDescription id="delete-import-description">
                  This permanently removes every stored row still associated with
                  {` ${deletingBatch.sourceName}`} and its history entry. Rows from other imports
                  are not removed, even when their contents are identical.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  autoFocus
                  disabled={busy}
                  onClick={() => setDeletingBatch(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void deleteImportBatch()}
                >
                  Remove import
                </Button>
              </CardContent>
            </Card>
          </dialog>
        </div>
      ) : null}
    </div>
  )
}
