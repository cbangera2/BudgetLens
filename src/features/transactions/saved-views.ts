import { isTransactionSort } from "./filtering"
import type { TransactionViewFilters } from "./filtering"

// Saved transaction filter views, persisted in localStorage under a versioned
// key so future schema changes can migrate forward without data loss.

export const SAVED_VIEWS_KEY = "budgetlens.savedViews.v1"

const LEGACY_KEYS = ["budgetlens.savedViews", "budgetlens.savedViews.v0"] as const

export const SAVED_VIEW_VERSION = 1
export const MAX_SAVED_VIEW_NAME_LENGTH = 80
export const MAX_SAVED_VIEWS = 50

export interface SavedView {
  id: string
  name: string
  filters: TransactionViewFilters
  createdAt: string
  updatedAt: string
}

interface PersistedPayload {
  version: number
  views: SavedView[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const FILTER_TEXT_KEYS = [
  "search",
  "merchant",
  "category",
  "account",
  "provider",
  "transactionType",
  "group",
  "from",
  "to",
] as const

const FILTER_LIST_KEYS = [
  "merchants",
  "excludedMerchants",
  "categories",
  "excludedCategories",
  "accounts",
  "excludedAccounts",
  "providers",
  "excludedProviders",
  "transactionTypes",
  "excludedTransactionTypes",
] as const

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

// Stored views replace the whole filter state on apply, so every required
// field is validated up front; a partial payload (e.g. `filters: {}`) would
// otherwise crash filtering on the first `.includes` call.
function isFilterState(value: unknown): value is TransactionViewFilters {
  if (!isRecord(value)) return false
  for (const key of FILTER_TEXT_KEYS) {
    if (typeof value[key] !== "string") return false
  }
  for (const key of FILTER_LIST_KEYS) {
    if (!isStringList(value[key])) return false
  }
  return isTransactionSort(value.sort)
}

function isSavedView(value: unknown): value is SavedView {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    isFilterState(value.filters) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  )
}

function parseViews(raw: string | null): SavedView[] | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(isSavedView)
    if (isRecord(parsed) && Array.isArray(parsed.views)) {
      return (parsed.views as unknown[]).filter(isSavedView)
    }
    return []
  } catch {
    return []
  }
}

function readKey(storage: Pick<Storage, "getItem">, key: string): SavedView[] | null {
  try {
    return parseViews(storage.getItem(key))
  } catch {
    return []
  }
}

/**
 * Loads saved views, migrating any legacy-key payload forward to the
 * versioned key. Never throws: corrupt payloads read as an empty list.
 */
export function loadSavedViews(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): SavedView[] {
  const current = readKey(storage, SAVED_VIEWS_KEY)
  if (current !== null) return current
  for (const legacy of LEGACY_KEYS) {
    const migrated = readKey(storage, legacy)
    if (migrated !== null && migrated.length > 0) {
      persistSavedViews(storage, migrated)
      return migrated
    }
  }
  return []
}

export function persistSavedViews(
  storage: Pick<Storage, "setItem">,
  views: readonly SavedView[],
): void {
  const payload: PersistedPayload = { version: SAVED_VIEW_VERSION, views: [...views] }
  try {
    storage.setItem(SAVED_VIEWS_KEY, JSON.stringify(payload))
  } catch {
    // Private-mode storage may throw; views simply do not persist.
  }
}

function makeId(): string {
  const candidate = globalThis.crypto?.randomUUID?.()
  if (typeof candidate === "string" && candidate.length > 0) return candidate
  return `view-${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 6).toString(36)}`
}

function normalizeName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_SAVED_VIEW_NAME_LENGTH).trim()
  return trimmed.length > 0 ? trimmed : null
}

export function createSavedView(
  views: readonly SavedView[],
  name: string,
  filters: TransactionViewFilters,
  now: string = new Date().toISOString(),
): SavedView[] {
  const normalized = normalizeName(name)
  if (normalized === null || views.length >= MAX_SAVED_VIEWS) return [...views]
  const view: SavedView = {
    id: makeId(),
    name: normalized,
    filters: { ...filters },
    createdAt: now,
    updatedAt: now,
  }
  return [...views, view]
}

export function renameSavedView(
  views: readonly SavedView[],
  id: string,
  name: string,
  now: string = new Date().toISOString(),
): SavedView[] {
  const normalized = normalizeName(name)
  if (normalized === null) return [...views]
  let changed = false
  const next = views.map((view) => {
    if (view.id !== id || view.name === normalized) return view
    changed = true
    return { ...view, name: normalized, updatedAt: now }
  })
  return changed ? next : [...views]
}

export function deleteSavedView(views: readonly SavedView[], id: string): SavedView[] {
  if (!views.some((view) => view.id === id)) return [...views]
  return views.filter((view) => view.id !== id)
}
