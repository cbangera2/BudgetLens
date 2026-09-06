// Reminder toggle + fired-key persistence (localStorage, synchronous like the
// app lock and auto-backup toggles). The toggle defaults OFF: notifications
// are interruptive, so permission is only ever requested when enabling.
// Fired keys prevent double-scheduling within the same budget period or bill
// cycle across restarts. Everything here is best-effort and never throws.

export const NOTIFICATIONS_ENABLED_KEY = "budgetlens.notifications.enabled"
export const NOTIFICATIONS_FIRED_KEY = "budgetlens.notifications.fired"

/** Cap so the fired-key list cannot grow without bound. */
export const MAX_FIRED_KEYS = 200

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** Default OFF. Unknown, missing, or unreadable values all resolve to false. */
export function readNotificationsEnabled(storage: Pick<Storage, "getItem">): boolean {
  try {
    const raw = storage.getItem(NOTIFICATIONS_ENABLED_KEY)
    if (raw === null) return false
    const normalized = raw.trim().toLowerCase()
    return normalized === "1" || normalized === "true"
  } catch {
    return false
  }
}

/** Best-effort persist. Never throws. */
export function writeNotificationsEnabled(
  storage: Pick<Storage, "setItem">,
  enabled: boolean,
): void {
  try {
    storage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? "1" : "0")
  } catch {
    // Private-mode storage may throw; the toggle just does not persist.
  }
}

/** Previously fired reminder keys, oldest-first. Never throws. */
export function readFiredKeys(storage: Pick<Storage, "getItem">): string[] {
  try {
    const raw = storage.getItem(NOTIFICATIONS_FIRED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry !== "")
  } catch {
    return []
  }
}

/** Append newly fired keys (deduped, newest-last, capped). Never throws. */
export function writeFiredKeys(
  storage: KeyValueStore,
  existing: readonly string[],
  fresh: readonly string[],
): void {
  try {
    const merged = [...existing, ...fresh].filter((entry) => typeof entry === "string")
    const deduped = [...new Set(merged)]
    const capped = deduped.slice(Math.max(0, deduped.length - MAX_FIRED_KEYS))
    storage.setItem(NOTIFICATIONS_FIRED_KEY, JSON.stringify(capped))
  } catch {
    // Best-effort; a missed write only risks a repeat reminder next run.
  }
}
