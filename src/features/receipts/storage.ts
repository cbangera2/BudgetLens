// Receipt blob storage with the same web/native split as src/lib/native.ts.
//
// Images live OUTSIDE the Dexie finance tables so JSON backups stay small:
// - Web: Origin Private File System (OPFS), with a separate IndexedDB blob
//   database as fallback. Neither is a finance table, so createBackup never
//   sees image bytes.
// - Native (Capacitor iOS shell): the app-data directory via the native
//   adapter (src/lib/native.ts append-only receipt helpers), which is the only
//   module allowed to import Capacitor plugins.
//
// Blobs are keyed by the SHA-256 hex of their bytes (see hash.ts).

import { deleteReceiptFile, isNative, readReceiptFile, writeReceiptFile } from "@/lib/native"

export const RECEIPT_BLOB_DATABASE = "budgetlens-receipt-blobs"
export const RECEIPT_BLOB_STORE = "blobs"

const RECEIPT_OPFS_DIRECTORY = "receipts"

function receiptFileName(hash: string): string {
  return `${hash}.jpg`
}

function isOpfsAvailable(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function"
  } catch {
    return false
  }
}

async function opfsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(RECEIPT_OPFS_DIRECTORY, { create: true })
}

async function saveToOpfs(hash: string, blob: Blob): Promise<void> {
  const directory = await opfsDirectory()
  const handle = await directory.getFileHandle(receiptFileName(hash), { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
}

async function loadFromOpfs(hash: string): Promise<Blob | null> {
  try {
    const directory = await opfsDirectory()
    const handle = await directory.getFileHandle(receiptFileName(hash))
    return await handle.getFile()
  } catch {
    return null
  }
}

async function deleteFromOpfs(hash: string): Promise<void> {
  try {
    const directory = await opfsDirectory()
    await directory.removeEntry(receiptFileName(hash))
  } catch {
    // Missing files are already gone; a broken OPFS falls through to IDB.
  }
}

interface StoredReceiptBlob {
  bytes: ArrayBuffer
  type: string
}

function isStoredBytes(value: unknown): value is ArrayBuffer {
  if (typeof value !== "object" || value === null) return false
  if (value instanceof ArrayBuffer) return true
  // IndexedDB clones ArrayBuffers across realms (notably fake-indexeddb in
  // unit tests), where instanceof fails; the toString tag still identifies
  // them.
  return Object.prototype.toString.call(value) === "[object ArrayBuffer]"
}

function isStoredReceiptBlob(value: unknown): value is StoredReceiptBlob {
  if (typeof value !== "object" || value === null) return false
  return (
    "bytes" in value &&
    isStoredBytes(value.bytes) &&
    "type" in value &&
    typeof value.type === "string"
  )
}

function openReceiptBlobDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const fail = (error: unknown) =>
      reject(error instanceof Error ? error : new Error("Could not open receipt image storage."))
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(RECEIPT_BLOB_DATABASE, 1)
    } catch (error) {
      fail(error)
      return
    }
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(RECEIPT_BLOB_STORE)) {
        request.result.createObjectStore(RECEIPT_BLOB_STORE)
      }
    })
    request.addEventListener("success", () => resolve(request.result))
    request.addEventListener("error", () => fail(request.error))
    request.addEventListener("blocked", () => fail(new Error("Receipt image storage is blocked.")))
  })
}

function runBlobStoreRequest<T>(
  mode: IDBTransactionMode,
  operate: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openReceiptBlobDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        let settled = false
        const close = () => {
          try {
            database.close()
          } catch {
            // Closing the handle after use is best-effort.
          }
        }
        const fail = (error: unknown) => {
          if (settled) return
          settled = true
          close()
          reject(error)
        }
        let transaction: IDBTransaction
        let request: IDBRequest<T>
        try {
          transaction = database.transaction(RECEIPT_BLOB_STORE, mode)
          request = operate(transaction.objectStore(RECEIPT_BLOB_STORE))
        } catch (error) {
          fail(error)
          return
        }
        transaction.addEventListener("complete", () => close())
        const transactionFailed = () =>
          fail(transaction.error ?? new Error("Could not access receipt image storage."))
        transaction.addEventListener("error", transactionFailed)
        transaction.addEventListener("abort", transactionFailed)
        request.addEventListener("success", () => {
          if (settled) return
          settled = true
          resolve(request.result)
        })
        request.addEventListener("error", () =>
          fail(request.error ?? new Error("Could not access receipt image storage.")),
        )
      }),
  )
}

// Blobs are stored as { bytes, type } records rather than raw Blobs so the
// IndexedDB fallback round-trips through every structured-clone
// implementation (including the fake-indexeddb test double).
async function saveToIdb(hash: string, blob: Blob): Promise<void> {
  const record: StoredReceiptBlob = { bytes: await blob.arrayBuffer(), type: blob.type }
  await runBlobStoreRequest("readwrite", (store) => store.put(record, hash))
}

async function loadFromIdb(hash: string): Promise<Blob | null> {
  const record = await runBlobStoreRequest("readonly", (store) => store.get(hash))
  if (!isStoredReceiptBlob(record)) return null
  return new Blob([record.bytes], { type: record.type || "image/jpeg" })
}

async function deleteFromIdb(hash: string): Promise<void> {
  try {
    await runBlobStoreRequest("readwrite", (store) => store.delete(hash))
  } catch {
    // Best-effort: a missing entry or a blocked database means nothing to do.
  }
}

/** Persist thumbnail bytes under their content hash. Rejects when unwritable. */
export async function saveReceiptBlob(hash: string, blob: Blob): Promise<void> {
  if (isNative()) {
    await writeReceiptFile(hash, await blobToBase64(blob))
    return
  }
  if (isOpfsAvailable()) {
    try {
      await saveToOpfs(hash, blob)
      return
    } catch {
      // A broken OPFS (for example denied quota) falls through to IndexedDB.
    }
  }
  await saveToIdb(hash, blob)
}

/**
 * Load thumbnail bytes by content hash. Resolves null when no image is stored
 * under that hash (missing is a normal outcome, not an error).
 */
export async function loadReceiptBlob(hash: string): Promise<Blob | null> {
  if (isNative()) return readReceiptFile(hash)
  if (isOpfsAvailable()) {
    try {
      const fromOpfs = await loadFromOpfs(hash)
      if (fromOpfs) return fromOpfs
    } catch {
      // A broken OPFS falls through to the IndexedDB fallback below.
    }
  }
  try {
    return await loadFromIdb(hash)
  } catch {
    return null
  }
}

/**
 * Delete thumbnail bytes from every backend. Best-effort and never rejects:
 * callers garbage-collect after the sidecar reference is already gone.
 */
export async function deleteReceiptBlob(hash: string): Promise<void> {
  if (isNative()) {
    await deleteReceiptFile(hash)
    return
  }
  await Promise.allSettled([deleteFromOpfs(hash), deleteFromIdb(hash)])
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

/**
 * Object URL for <img> thumbnails, or null when the runtime has no
 * URL.createObjectURL (some unit-test runtimes). Callers render a placeholder
 * then; real browsers always have it.
 */
export function createReceiptDisplayUrl(blob: Blob): string | null {
  try {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      return URL.createObjectURL(blob)
    }
  } catch {
    // A broken URL implementation falls through to the placeholder below.
  }
  return null
}
