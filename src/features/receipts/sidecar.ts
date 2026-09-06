// Sidecar map for receipt references.
//
// Design constraint: receipt images live OUTSIDE the Dexie finance tables (and
// outside JSON backups) so backups stay small. Adding a Dexie column would
// pull image bytes into every backup, so the transaction side keeps only a
// content-hash reference here: transaction id -> ReceiptRef[]. The map itself
// lives in localStorage (never in Dexie), which keeps finance-table schemas,
// backup payloads, and restore semantics untouched.

export const RECEIPT_SIDECAR_KEY = "budgetlens.receipts.sidecar.v1"

export interface ReceiptRef {
  /** SHA-256 hex of the stored thumbnail bytes; the key into the blob store. */
  hash: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  createdAt: string
}

type SidecarMap = Record<string, ReceiptRef[]>

function receiptStorage(): Storage | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null
    return globalThis.localStorage
  } catch {
    return null
  }
}

function isReceiptRef(value: unknown): value is ReceiptRef {
  if (typeof value !== "object" || value === null) return false
  if (!("hash" in value) || typeof value.hash !== "string" || value.hash.length === 0) {
    return false
  }
  if (!("mimeType" in value) || typeof value.mimeType !== "string") return false
  if (!("sizeBytes" in value) || typeof value.sizeBytes !== "number") return false
  if (!("width" in value) || (value.width !== null && typeof value.width !== "number")) {
    return false
  }
  if (!("height" in value) || (value.height !== null && typeof value.height !== "number")) {
    return false
  }
  return "createdAt" in value && typeof value.createdAt === "string"
}

/** Whole sidecar map, tolerant of missing storage and corrupt payloads. */
export function readReceiptSidecar(): SidecarMap {
  const storage = receiptStorage()
  if (!storage) return {}
  try {
    const raw = storage.getItem(RECEIPT_SIDECAR_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return {}
    const result: SidecarMap = {}
    for (const [transactionId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue
      const refs = value.filter(isReceiptRef)
      if (refs.length > 0) result[transactionId] = refs
    }
    return result
  } catch {
    return {}
  }
}

function writeReceiptSidecar(map: SidecarMap): void {
  receiptStorage()?.setItem(RECEIPT_SIDECAR_KEY, JSON.stringify(map))
}

/** False when the sidecar store is unreachable (for example storage disabled). */
export function isReceiptSidecarAvailable(): boolean {
  return receiptStorage() !== null
}

/** Receipt references for one transaction (empty when none are attached). */
export function listReceiptRefs(transactionId: string): ReceiptRef[] {
  return readReceiptSidecar()[transactionId] ?? []
}

/** Append a reference; re-attaching identical bytes is a no-op (hash dedupe). */
export function addReceiptRef(transactionId: string, ref: ReceiptRef): ReceiptRef[] {
  const map = readReceiptSidecar()
  const existing = map[transactionId] ?? []
  const next = existing.some((entry) => entry.hash === ref.hash) ? existing : [...existing, ref]
  writeReceiptSidecar({ ...map, [transactionId]: next })
  return next
}

/** Remove one reference; returns the removed ref or null when absent. */
export function removeReceiptRef(transactionId: string, hash: string): ReceiptRef | null {
  const map = readReceiptSidecar()
  const existing = map[transactionId] ?? []
  const removed = existing.find((entry) => entry.hash === hash) ?? null
  if (!removed) return null
  const next = existing.filter((entry) => entry.hash !== hash)
  if (next.length === 0) {
    const remaining = { ...map }
    delete remaining[transactionId]
    writeReceiptSidecar(remaining)
  } else {
    writeReceiptSidecar({ ...map, [transactionId]: next })
  }
  return removed
}

/** Drop every reference for a transaction; returns the removed refs. */
export function clearReceiptRefs(transactionId: string): ReceiptRef[] {
  const map = readReceiptSidecar()
  const removed = map[transactionId] ?? []
  if (removed.length === 0) return []
  const remaining = { ...map }
  delete remaining[transactionId]
  writeReceiptSidecar(remaining)
  return removed
}

/**
 * Transaction ids still referencing a blob hash. Used for reference-counted
 * garbage collection: shared bytes survive until the last reference is gone.
 */
export function findTransactionsReferencingHash(hash: string): string[] {
  return Object.entries(readReceiptSidecar())
    .filter(([, refs]) => refs.some((ref) => ref.hash === hash))
    .map(([transactionId]) => transactionId)
}
