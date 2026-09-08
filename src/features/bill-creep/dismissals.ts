// Dismissed bill-creep persistence (localStorage, versioned key).
//
// Dismissed creeps stay dismissed across restarts: the creep list and the
// creep notifier both filter these keys. Same best-effort pattern as the bill
// calendar overrides: every access never throws, corrupt or
// version-mismatched payloads fall back to empty, and clearing site data
// restores every creep (expected, not data loss).

export const BILL_CREEP_DISMISSALS_KEY = "budgetlens.bill-creep.dismissed.v1"
export const BILL_CREEP_DISMISSALS_VERSION = 1

/** Cap so the dismissed list cannot grow without bound. */
export const MAX_DISMISSED_CREEP_KEYS = 200

interface VersionedDismissals {
  version: typeof BILL_CREEP_DISMISSALS_VERSION
  keys: unknown
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "setItem" | "removeItem">
type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function sanitizeKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== "string" || entry === "") continue
    seen.add(entry)
  }
  return [...seen]
}

/** Dismissed merchant keys, oldest-first. Never throws. */
export function loadDismissedCreepKeys(storage?: ReadableStorage): Set<string> {
  let raw: string | null
  try {
    raw = (storage ?? globalThis.localStorage).getItem(BILL_CREEP_DISMISSALS_KEY)
  } catch {
    return new Set()
  }
  if (raw === null) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return new Set()
    const record = parsed as Partial<VersionedDismissals>
    if (record.version !== BILL_CREEP_DISMISSALS_VERSION) return new Set()
    return new Set(sanitizeKeys(record.keys))
  } catch {
    return new Set()
  }
}

/** Persist dismissed keys (deduped, newest-last, capped). Never throws. */
export function saveDismissedCreepKeys(keys: Iterable<string>, storage?: WritableStorage): void {
  let store: WritableStorage | null
  try {
    store = storage ?? globalThis.localStorage
  } catch {
    return
  }
  if (!store) return
  const deduped = sanitizeKeys([...keys])
  const capped = deduped.slice(Math.max(0, deduped.length - MAX_DISMISSED_CREEP_KEYS))
  try {
    if (capped.length === 0) {
      store.removeItem(BILL_CREEP_DISMISSALS_KEY)
      return
    }
    const record: VersionedDismissals = { version: BILL_CREEP_DISMISSALS_VERSION, keys: capped }
    store.setItem(BILL_CREEP_DISMISSALS_KEY, JSON.stringify(record))
  } catch {
    // Private-mode storage may throw; dismissals stay in memory.
  }
}

/** Dismiss one merchant, returning the updated set. Never throws. */
export function dismissCreepKey(key: string, storage?: KeyValueStorage): Set<string> {
  const next = loadDismissedCreepKeys(storage)
  if (key) next.add(key)
  saveDismissedCreepKeys(next, storage)
  return next
}

/** Restore one merchant, returning the updated set. Never throws. */
export function restoreCreepKey(key: string, storage?: KeyValueStorage): Set<string> {
  const next = loadDismissedCreepKeys(storage)
  next.delete(key)
  saveDismissedCreepKeys(next, storage)
  return next
}
