export const CASHFLOW_CUSHION_STORAGE_KEY = "budgetlens.cashflow.cushion.v1"
export const DEFAULT_CASHFLOW_CUSHION_MINOR = 20_000

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function parseCushionMinor(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 0) return null
  return rounded
}

/** Read the persisted cushion (minor units). Falls back to the default. */
export function loadCashflowCushionMinor(): number {
  const store = storage()
  if (!store) return DEFAULT_CASHFLOW_CUSHION_MINOR
  try {
    const raw = store.getItem(CASHFLOW_CUSHION_STORAGE_KEY)
    if (raw === null) return DEFAULT_CASHFLOW_CUSHION_MINOR
    const parsed = Number(raw)
    return parseCushionMinor(parsed) ?? DEFAULT_CASHFLOW_CUSHION_MINOR
  } catch {
    return DEFAULT_CASHFLOW_CUSHION_MINOR
  }
}

/** Persist the cushion (minor units). Silently ignores storage failures. */
export function saveCashflowCushionMinor(minor: number): void {
  const valid = parseCushionMinor(minor)
  if (valid === null) return
  try {
    storage()?.setItem(CASHFLOW_CUSHION_STORAGE_KEY, String(valid))
  } catch {
    // Private-mode or unavailable storage: keep the in-memory value only.
  }
}

/** Parse a dollars text-field value into minor units. Null when invalid. */
export function parseCushionDollarsInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return Math.round(numeric * 100)
}

export function cushionMinorToDollarsInput(minor: number): string {
  return String(Math.round(minor) / 100)
}
