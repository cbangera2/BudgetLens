// Per-bill user corrections for the bill calendar.
//
// Detected bills are projections, so users can correct them: pin an expected
// amount, pin an expected day-of-month (monthly bills), or dismiss a merchant
// that is not a bill at all. Overrides persist in localStorage under a
// versioned key, following the same best-effort pattern as the other user
// prefs in this repo (budget form defaults, cash-flow cushion): every access
// never throws, corrupt or version-mismatched payloads fall back to empty,
// and clearing site data resets to detected values (expected, not data loss).

import type { SubscriptionSummary } from "@/features/subscriptions/detect"

export const BILL_OVERRIDES_STORAGE_KEY = "budgetlens.bill-calendar.overrides.v1"
export const BILL_OVERRIDES_VERSION = 1

/** Day-of-month pinning only applies to monthly cadences (see applyDayOverride). */
export const DAY_OVERRIDE_CADENCE: SubscriptionSummary["cadence"] = "monthly"

export interface BillOverride {
  amountMinor?: number
  dayOfMonth?: number
  dismissed?: boolean
}

export type BillOverrides = Record<string, BillOverride>

interface VersionedBillOverrides {
  version: typeof BILL_OVERRIDES_VERSION
  overrides: Record<string, unknown>
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "setItem" | "removeItem">

const MAX_AMOUNT_MINOR = 999_999_999_99

function isValidAmountMinor(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_AMOUNT_MINOR
  )
}

function isValidDayOfMonth(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sanitizeOverride(value: unknown): BillOverride | null {
  if (!isRecord(value)) return null
  const record = value
  const override: BillOverride = {}
  if (isValidAmountMinor(record.amountMinor)) override.amountMinor = record.amountMinor
  if (isValidDayOfMonth(record.dayOfMonth)) override.dayOfMonth = record.dayOfMonth
  if (record.dismissed === true) override.dismissed = true
  return override.amountMinor !== undefined ||
    override.dayOfMonth !== undefined ||
    override.dismissed === true
    ? override
    : null
}

export function loadBillOverrides(storage?: ReadableStorage): BillOverrides {
  let raw: string | null
  try {
    // Resolve inside try: the global getter itself can throw when storage is
    // blocked, and this helper must never throw.
    raw = (storage ?? globalThis.localStorage).getItem(BILL_OVERRIDES_STORAGE_KEY)
  } catch {
    return {}
  }
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return {}
    const record = parsed as Partial<VersionedBillOverrides>
    if (record.version !== BILL_OVERRIDES_VERSION) return {}
    if (typeof record.overrides !== "object" || record.overrides === null) return {}
    const overrides: BillOverrides = {}
    for (const [key, value] of Object.entries(record.overrides)) {
      if (!key) continue
      const override = sanitizeOverride(value)
      if (override) overrides[key] = override
    }
    return overrides
  } catch {
    return {}
  }
}

export function saveBillOverrides(overrides: BillOverrides, storage?: WritableStorage): void {
  let store: WritableStorage | null
  try {
    store = storage ?? globalThis.localStorage
  } catch {
    return
  }
  if (!store) return
  const sanitized: BillOverrides = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (!key) continue
    const override = sanitizeOverride(value)
    if (override) sanitized[key] = override
  }
  try {
    if (Object.keys(sanitized).length === 0) {
      store.removeItem(BILL_OVERRIDES_STORAGE_KEY)
      return
    }
    const record: VersionedBillOverrides = {
      version: BILL_OVERRIDES_VERSION,
      overrides: sanitized,
    }
    store.setItem(BILL_OVERRIDES_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private-mode storage may throw; overrides stay in memory.
  }
}

/** Parse a dollars text-field value into minor units. Null when invalid. */
export function parseOverrideAmountMinor(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  // Reject grouping separators and currency symbols rather than guessing.
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const minor = Math.round(Number(trimmed) * 100)
  return isValidAmountMinor(minor) ? minor : null
}

/** Parse a day-of-month text-field value (1-31). Null when invalid. */
export function parseOverrideDayOfMonth(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d{1,2}$/.test(trimmed)) return null
  const day = Number(trimmed)
  return isValidDayOfMonth(day) ? day : null
}

export function overrideAmountDollars(amountMinor: number): string {
  return String(amountMinor / 100)
}

export function countDismissed(overrides: BillOverrides): number {
  return Object.values(overrides).filter((override) => override.dismissed === true).length
}
