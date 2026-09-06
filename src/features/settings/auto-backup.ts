import { repositories } from "@/db/repositories"
import { createBackup } from "@/features/settings/backup"
import {
  AUTO_BACKUP_INTERVAL_MS,
  isNative,
  readAutoBackupLastTimestamp,
  writeAutoBackupFile,
  writeAutoBackupLastTimestamp,
} from "@/lib/native"

// Local toggle for the suspend auto-backup. Stored in localStorage (same
// pattern as the app lock) so the Settings checkbox stays synchronous;
// the last-run timestamp lives in Preferences (see native.ts).
export const AUTO_BACKUP_ENABLED_KEY = "budgetlens.auto-backup.enabled"

export type AutoBackupStatus =
  | "skipped-web"
  | "skipped-disabled"
  | "skipped-throttled"
  | "skipped-empty"
  | "backed-up"
  | "skipped-error"

export interface AutoBackupDeps {
  isNativeShell: boolean
  isEnabled: boolean
  lastTimestamp: number | null
  nowMs: number
  loadBackup: () => Promise<unknown>
  writeFile: (contents: string) => Promise<void>
  saveTimestamp: (nowMs: number) => Promise<void>
}

/** Default ON for native; web never auto-backs up. Never throws. */
export function readAutoBackupEnabled(
  storage: Pick<Storage, "getItem">,
  isNativeShell: boolean,
): boolean {
  if (!isNativeShell) return false
  try {
    const raw = storage.getItem(AUTO_BACKUP_ENABLED_KEY)
    if (raw === null) return true
    const normalized = raw.trim().toLowerCase()
    if (normalized === "0" || normalized === "false") return false
    return true
  } catch {
    return true
  }
}

/** Best-effort persist. Never throws. */
export function writeAutoBackupEnabled(storage: Pick<Storage, "setItem">, enabled: boolean): void {
  try {
    storage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? "1" : "0")
  } catch {
    // Private-mode storage may throw; the toggle just does not persist.
  }
}

/** True when there is no recent run inside the interval. Pure; never throws. */
export function shouldRunAutoBackup(
  last: number | null | undefined,
  nowMs: number,
  intervalMs: number = AUTO_BACKUP_INTERVAL_MS,
): boolean {
  try {
    if (last === null || last === undefined) return true
    if (typeof last !== "number" || !Number.isFinite(last) || last <= 0) return true
    if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) return false
    if (nowMs < last) return false
    return nowMs - last >= intervalMs
  } catch {
    return false
  }
}

const BACKUP_TABLE_KEYS = [
  "transactions",
  "wealth",
  "wealthBreakdown",
  "wealthAccounts",
  "budgets",
  "imports",
  "transactionGroups",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** True when every backup table is empty (or the payload is invalid). Never throws. */
export function isBackupEmpty(backup: unknown): boolean {
  try {
    if (!isRecord(backup)) return true
    return BACKUP_TABLE_KEYS.every((key) => {
      const rows = backup[key]
      return !Array.isArray(rows) || rows.length === 0
    })
  } catch {
    return true
  }
}

/**
 * Injectable suspend-backup orchestrator. Best-effort throughout: resolves
 * with a status, never rejects, never throws.
 */
export async function maybeRunAutoBackup(deps: AutoBackupDeps): Promise<AutoBackupStatus> {
  try {
    if (!deps.isNativeShell) return "skipped-web"
    if (!deps.isEnabled) return "skipped-disabled"
    if (!shouldRunAutoBackup(deps.lastTimestamp, deps.nowMs)) return "skipped-throttled"
    let backup: unknown
    try {
      backup = await deps.loadBackup()
    } catch {
      return "skipped-error"
    }
    if (isBackupEmpty(backup)) return "skipped-empty"
    let contents: string
    try {
      contents = JSON.stringify(backup)
    } catch {
      return "skipped-error"
    }
    try {
      await deps.writeFile(contents)
    } catch {
      return "skipped-error"
    }
    try {
      await deps.saveTimestamp(deps.nowMs)
    } catch {
      // The file is written; a timestamp failure just retries next suspend.
    }
    return "backed-up"
  } catch {
    return "skipped-error"
  }
}

/**
 * Production suspend handler: native-only daily backup to
 * Documents/budgetlens-auto-backup.json. Best-effort; never throws.
 */
export async function runSuspendAutoBackup(nowMs: number = Date.now()): Promise<void> {
  try {
    let isNativeShell = false
    try {
      isNativeShell = isNative()
    } catch {
      return
    }
    if (!isNativeShell) return
    let enabled = true
    try {
      const storage =
        typeof window !== "undefined" && window.localStorage ? window.localStorage : null
      enabled = storage ? readAutoBackupEnabled(storage, true) : true
    } catch {
      enabled = true
    }
    if (!enabled) return
    let last: number | null = null
    try {
      last = await readAutoBackupLastTimestamp()
    } catch {
      last = null
    }
    await maybeRunAutoBackup({
      isNativeShell: true,
      isEnabled: enabled,
      lastTimestamp: last,
      nowMs,
      loadBackup: () => createBackup(repositories),
      writeFile: (contents) => writeAutoBackupFile(contents),
      saveTimestamp: (stamp) => writeAutoBackupLastTimestamp(stamp),
    })
  } catch {
    // Best-effort: suspend must never break the UI.
  }
}

/**
 * Wire document visibilitychange (hidden) + pagehide to the suspend backup.
 * Fire-and-forget; never throws, never blocks the UI. Returns an unsubscribe.
 */
export function setupAutoBackupOnSuspend(): () => void {
  try {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return () => undefined
    }
    const trigger = (): void => {
      try {
        void runSuspendAutoBackup().catch(() => undefined)
      } catch {
        // Never let suspend handling throw.
      }
    }
    const onVisibilityChange = (): void => {
      try {
        if (document.visibilityState === "hidden") trigger()
      } catch {
        // Ignore.
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pagehide", trigger)
    return () => {
      try {
        document.removeEventListener("visibilitychange", onVisibilityChange)
      } catch {
        // Ignore.
      }
      try {
        window.removeEventListener("pagehide", trigger)
      } catch {
        // Ignore.
      }
    }
  } catch {
    return () => undefined
  }
}
