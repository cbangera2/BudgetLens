import type { ImportBatch } from "@/domain/models"

export const STALE_NUDGE_THRESHOLD_DAYS = 30
export const STALE_NUDGE_THRESHOLD_MS = STALE_NUDGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
export const STALE_NUDGE_STORAGE_KEY = "budgetlens.stale-nudge.v1"
export const STALE_NUDGE_STORAGE_VERSION = 1
export const STALE_NUDGE_EMPTY_KEY = "empty"

export type StaleNudgeVariant = "fresh" | "stale" | "empty"

export interface StaleNudgeFreshness {
  variant: StaleNudgeVariant
  daysSince: number | null
  lastImportAt: string | null
}

type ImportTimestamp = Pick<ImportBatch, "importedAt">

function parseTimestamp(value: string): number | null {
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export function getLatestImportAt(
  batches: readonly ImportTimestamp[] | undefined | null,
): string | null {
  if (!batches || batches.length === 0) return null
  let latestTime: number | null = null
  let latestValue: string | null = null
  for (const batch of batches) {
    const time = parseTimestamp(batch.importedAt)
    if (time === null) continue
    if (latestTime === null || time > latestTime) {
      latestTime = time
      latestValue = batch.importedAt
    }
  }
  return latestValue
}

export function getDaysSinceImport(lastImportAt: string, now: Date = new Date()): number {
  const lastTime = parseTimestamp(lastImportAt)
  if (lastTime === null) return 0
  const diff = now.getTime() - lastTime
  if (diff <= 0) return 0
  return Math.floor(diff / (24 * 60 * 60 * 1000))
}

export function getStaleNudgeFreshness(
  batches: readonly ImportTimestamp[] | undefined | null,
  now: Date = new Date(),
): StaleNudgeFreshness {
  const lastImportAt = getLatestImportAt(batches)
  if (lastImportAt === null) return { variant: "empty", daysSince: null, lastImportAt: null }
  const lastTime = parseTimestamp(lastImportAt)
  if (lastTime === null) return { variant: "empty", daysSince: null, lastImportAt: null }
  const diff = now.getTime() - lastTime
  if (diff <= 0) return { variant: "fresh", daysSince: 0, lastImportAt }
  const daysSince = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (diff > STALE_NUDGE_THRESHOLD_MS) return { variant: "stale", daysSince, lastImportAt }
  return { variant: "fresh", daysSince, lastImportAt }
}

export interface StaleNudgeDismissalRecord {
  version: typeof STALE_NUDGE_STORAGE_VERSION
  dismissedFor: string
}

export function getStaleNudgeDismissalKey(freshness: StaleNudgeFreshness): string {
  if (freshness.lastImportAt === null) return STALE_NUDGE_EMPTY_KEY
  if (freshness.variant !== "stale") return freshness.lastImportAt
  // Dismissals are scoped to one 30-day stale window: dismissing at 45 days
  // stays dismissed at 59 days but the nudge reappears at 61 days for the
  // same import, and for any new import (a new lastImportAt means a new key).
  const period = Math.floor((freshness.daysSince ?? 0) / STALE_NUDGE_THRESHOLD_DAYS)
  return `${freshness.lastImportAt}#stale-${period}`
}

function isDismissalRecord(value: unknown): value is StaleNudgeDismissalRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<StaleNudgeDismissalRecord>
  return record.version === STALE_NUDGE_STORAGE_VERSION && typeof record.dismissedFor === "string"
}

export function readStaleNudgeDismissal(
  storage: Pick<Storage, "getItem"> | undefined | null,
): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STALE_NUDGE_STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isDismissalRecord(parsed)) return null
    return parsed.dismissedFor
  } catch {
    return null
  }
}

export function isStaleNudgeDismissed(
  storage: Pick<Storage, "getItem"> | undefined | null,
  key: string,
): boolean {
  return readStaleNudgeDismissal(storage) === key
}

export function dismissStaleNudge(
  storage: Pick<Storage, "setItem"> | undefined | null,
  key: string,
): void {
  if (!storage) return
  const record: StaleNudgeDismissalRecord = {
    version: STALE_NUDGE_STORAGE_VERSION,
    dismissedFor: key,
  }
  try {
    storage.setItem(STALE_NUDGE_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private-mode storage may throw; the banner will show again next launch.
  }
}

export function clearStaleNudgeDismissal(
  storage: Pick<Storage, "removeItem"> | undefined | null,
): void {
  if (!storage) return
  try {
    storage.removeItem(STALE_NUDGE_STORAGE_KEY)
  } catch {
    // Best-effort; a missed clear only keeps a dismissal hidden.
  }
}

export function shouldShowStaleNudge(
  freshness: StaleNudgeFreshness,
  storage: Pick<Storage, "getItem"> | undefined | null,
): boolean {
  if (freshness.variant === "fresh") return false
  const key = getStaleNudgeDismissalKey(freshness)
  return !isStaleNudgeDismissed(storage, key)
}
