import { useEffect, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import type { ImportBatch } from "@/domain/models"
import { importService } from "@/features/imports/import-service"
import { importFileType, sanitizeImportSourceName } from "@/features/imports/parser"
import {
  DEFAULT_IMPORT_LIMITS,
  type DuplicatePolicy,
  type ImportCollectionPreview,
  type ImportFileFailure,
  type ImportFileInput,
  type ImportLimits,
  type ImportPreview,
} from "@/features/imports/types"

function kindLabel(kind: ImportBatch["kind"]): string {
  if (kind === "netWorth") return "Net worth"
  if (kind === "investment") return "Investments"
  return "Transactions"
}

interface ReadableImportFile {
  name: string
  size: number
  text: () => Promise<string>
}

export async function readJsonFilesIndependently(
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
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [collection, setCollection] = useState<ImportCollectionPreview | null>(null)
  const [history, setHistory] = useState<ImportBatch[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip")
  const [deletingBatch, setDeletingBatch] = useState<ImportBatch | null>(null)
  const [resultFailures, setResultFailures] = useState<ImportFileFailure[]>([])
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void repositories.imports.list().then(setHistory)
  }, [])

  async function selectFiles(files: File[], policy = duplicatePolicy) {
    setPreview(null)
    setCollection(null)
    setResultFailures([])
    setStatus("")
    setSelectedFile(null)
    setSelectedFiles(files)
    if (files.length === 0) return
    const fileTypes = files.map((file) => importFileType(file.name))
    if (fileTypes.some((type) => type === null)) {
      setStatus("Unsupported file type. Select .csv or .json files.")
      return
    }
    const hasCsv = fileTypes.includes("csv")
    const hasJson = fileTypes.includes("json")
    if ((hasCsv && hasJson) || (hasCsv && files.length > 1)) {
      setStatus("Import one CSV at a time, or select multiple JSON files. Do not mix formats.")
      return
    }
    if (files.length > DEFAULT_IMPORT_LIMITS.maxFiles) {
      setStatus(`Select at most ${DEFAULT_IMPORT_LIMITS.maxFiles} JSON files at once.`)
      return
    }
    setBusy(true)
    try {
      if (hasCsv) {
        const file = files[0]!
        if (file.size > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
          setStatus("The selected CSV exceeds the 10 MB per-file limit.")
          return
        }
        setStatus("Reading and validating the CSV file…")
        setSelectedFile(file)
        const next = await importService.preview(await file.text(), file.name, "skip", policy)
        setPreview(next)
        setStatus(
          next.duplicateFile && next.duplicatePolicy === "skip"
            ? "This exact file was already imported. Nothing will be written."
            : "Preview ready. Review the counts before importing.",
        )
      } else {
        setStatus(`Reading JSON file 0 of ${files.length.toLocaleString()}…`)
        const read = await readJsonFilesIndependently(files, DEFAULT_IMPORT_LIMITS, (done, total) =>
          setStatus(`Reading JSON file ${done.toLocaleString()} of ${total.toLocaleString()}…`),
        )
        setStatus(`Parsing ${read.inputs.length.toLocaleString()} readable JSON file(s)…`)
        const parsed =
          read.inputs.length > 0
            ? await importService.previewMany(read.inputs, policy)
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
            : "All selected JSON files are ready. Review each result before importing.",
        )
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The file could not be read.")
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
      setPreview(await importService.preview(await selectedFile.text(), selectedFile.name, policy))
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
      const receipt = await importService.commit(preview)
      setHistory(await repositories.imports.list())
      setPreview(null)
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
    if (selectedFiles.length > 0) await selectFiles(selectedFiles, policy)
  }

  async function deleteImportBatch() {
    if (!deletingBatch) return
    setBusy(true)
    try {
      const receipt = await importService.deleteBatch(deletingBatch.id)
      setHistory(await repositories.imports.list())
      setDeletingBatch(null)
      const deletedCount = receipt.deletedTransactionCount + receipt.deletedWealthCount
      setStatus(
        `Removed ${deletedCount.toLocaleString()} stored row${deletedCount === 1 ? "" : "s"} from ${receipt.batch.sourceName}.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The import could not be removed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Private by default</p>
        <h1 className="text-3xl font-semibold tracking-tight">Import Credit Karma data</h1>
        <p className="max-w-2xl text-muted-foreground">
          Preview transactions, net worth, or investment history before saving it in this browser.
          File contents never become part of import history.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Select Credit Karma exports</CardTitle>
          <CardDescription>
            Import one CSV export or a group of transaction JSON responses.
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
              onChange={(event) => void selectFiles([...(event.currentTarget.files ?? [])])}
            />
            <p className="text-xs text-muted-foreground">
              One CSV at a time, or up to 20 JSON files. Maximum 10 MB and 100,000 rows per file; 50
              MB total. CSV and JSON cannot be mixed in one selection.
            </p>
          </div>
          <output aria-live="polite" className="block text-sm">
            {status || (busy ? "Reading and validating the file…" : "")}
          </output>
        </CardContent>
      </Card>

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
        <Card aria-labelledby="json-import-preview-title">
          <CardHeader>
            <CardTitle id="json-import-preview-title">JSON import preview</CardTitle>
            <CardDescription>
              {collection.selectedCount.toLocaleString()} selected file(s). Invalid files remain
              excluded unless you fix and select them again. Duplicate rows are
              {duplicatePolicy === "skip" ? " skipped." : " included intentionally."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
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
                <caption className="sr-only">JSON file preview results</caption>
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
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card aria-labelledby="import-preview-title">
          <CardHeader>
            <CardTitle id="import-preview-title">Import preview</CardTitle>
            <CardDescription>
              {kindLabel(preview.kind)} · {preview.sourceName}
              {preview.kind === "transactions"
                ? ` · Duplicates ${preview.duplicatePolicy === "skip" ? "skipped" : "included"}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
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
                  When a date already has another value
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
                onClick={() => setPreview(null)}
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
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setDeletingBatch(batch)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No completed imports yet.</p>
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
