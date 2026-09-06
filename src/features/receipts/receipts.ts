// High-level receipt API: attach/list/remove receipt photos per transaction.
//
// Images are stored OUTSIDE the Dexie finance tables (see storage.ts) and the
// transaction side keeps only content-hash references (see sidecar.ts), so
// JSON backups (see features/settings/backup.ts) never contain image data.
// Deleting a transaction deletes its images via installReceiptCascade, which
// patches the transaction repository's remove/clear idempotently — the repo
// and database modules themselves stay untouched.

import { repositories } from "@/db/repositories"
import type { BudgetLensRepositories } from "@/domain/repositories"
import { downscaleToThumbnail } from "@/features/receipts/downscale"
import { sha256HexBlob } from "@/features/receipts/hash"
import {
  addReceiptRef,
  clearReceiptRefs,
  findTransactionsReferencingHash,
  listReceiptRefs,
  readReceiptSidecar,
  removeReceiptRef,
  type ReceiptRef,
} from "@/features/receipts/sidecar"
import { deleteReceiptBlob, loadReceiptBlob, saveReceiptBlob } from "@/features/receipts/storage"

export type { ReceiptRef }

function isSupportedImage(source: Blob): boolean {
  // Some mobile pickers report an empty MIME type for camera captures.
  return source.type === "" || source.type.startsWith("image/")
}

/**
 * Downscale a captured image, store its bytes under their content hash, and
 * record the reference on the transaction's sidecar entry. Idempotent for
 * identical bytes (same hash, single stored copy).
 */
export async function addReceiptForTransaction(
  transactionId: string,
  source: Blob,
): Promise<ReceiptRef> {
  if (!transactionId) throw new Error("A transaction id is required to attach a receipt photo.")
  if (!isSupportedImage(source)) {
    throw new Error("Only image files can be attached as receipt photos.")
  }
  const downscaled = await downscaleToThumbnail(source)
  const hash = await sha256HexBlob(downscaled.blob)
  await saveReceiptBlob(hash, downscaled.blob)
  const ref: ReceiptRef = {
    hash,
    mimeType: downscaled.mimeType,
    sizeBytes: downscaled.blob.size,
    width: downscaled.width > 0 ? downscaled.width : null,
    height: downscaled.height > 0 ? downscaled.height : null,
    createdAt: new Date().toISOString(),
  }
  addReceiptRef(transactionId, ref)
  return ref
}

/** Hash references attached to a transaction (empty when none). */
export function listTransactionReceipts(transactionId: string): ReceiptRef[] {
  return listReceiptRefs(transactionId)
}

/** Thumbnail bytes for a reference, or null when the bytes are gone. */
export async function loadTransactionReceipt(hash: string): Promise<Blob | null> {
  return loadReceiptBlob(hash)
}

async function collectGarbage(hash: string): Promise<void> {
  // Shared bytes (same capture attached twice) survive until the last
  // transaction referencing them lets go.
  if (findTransactionsReferencingHash(hash).length === 0) {
    await deleteReceiptBlob(hash)
  }
}

/**
 * Detach one photo; deletes its bytes when no other transaction references
 * them. Returns false when the reference did not exist.
 */
export async function removeTransactionReceipt(
  transactionId: string,
  hash: string,
): Promise<boolean> {
  const removed = removeReceiptRef(transactionId, hash)
  if (!removed) return false
  await collectGarbage(hash)
  return true
}

/**
 * Delete-cascade: drop every receipt reference for a transaction and garbage-
 * collect its now-unreferenced bytes. Returns the number of refs removed.
 */
export async function deleteTransactionReceipts(transactionId: string): Promise<number> {
  const removed = clearReceiptRefs(transactionId)
  const hashes = [...new Set(removed.map((ref) => ref.hash))]
  await Promise.all(hashes.map((hash) => collectGarbage(hash)))
  return removed.length
}

type TransactionSource = Pick<BudgetLensRepositories, "transactions">

/**
 * Remove sidecar entries (and their bytes) for transactions that no longer
 * exist. Covers removal paths that bypass the repository cascade, such as a
 * backup restore that replaces finance tables directly. Returns the number of
 * references pruned.
 */
export async function pruneOrphanedReceipts(
  source: TransactionSource = repositories,
): Promise<number> {
  const liveIds = new Set((await source.transactions.list()).map((transaction) => transaction.id))
  let pruned = 0
  for (const transactionId of Object.keys(readReceiptSidecar())) {
    if (liveIds.has(transactionId)) continue
    // oxlint-disable-next-line no-await-in-loop -- Cascade order is irrelevant but sequential keeps IDB pressure low.
    pruned += await deleteTransactionReceipts(transactionId)
  }
  return pruned
}

const cascadedTargets = new WeakSet<object>()

/**
 * Wire "deleting a transaction deletes its images" without touching the
 * repository module: wraps remove/clear on the shared repository instance
 * (idempotent per target). Receipt cleanup is best-effort and never changes
 * transaction-removal semantics — repository errors still propagate, receipt
 * errors never do.
 */
export function installReceiptCascade(target: TransactionSource = repositories): void {
  if (cascadedTargets.has(target.transactions)) return
  cascadedTargets.add(target.transactions)
  const originalRemove = target.transactions.remove.bind(target.transactions)
  const originalClear = target.transactions.clear.bind(target.transactions)
  target.transactions.remove = async (id: string): Promise<void> => {
    await originalRemove(id)
    try {
      await deleteTransactionReceipts(id)
    } catch {
      // The transaction is already gone; orphaned bytes are pruned later.
    }
  }
  target.transactions.clear = async (): Promise<void> => {
    await originalClear()
    try {
      await Promise.all(
        Object.keys(readReceiptSidecar()).map((transactionId) =>
          deleteTransactionReceipts(transactionId),
        ),
      )
    } catch {
      // Clearing finance data must not fail because of receipt cleanup.
    }
  }
}
