// Native bridge adapter for the Capacitor iOS shell.
//
// ONLY this module may import Capacitor plugins. Features import this module
// and get web fallbacks automatically, so jsdom tests, desktop builds, and
// GitHub Pages stay green with zero native runtime.
//
// Deliberately NOT bridged here (DOM/WebView already handles them):
// - File picking: <input type=file> summons the native Files/iCloud picker
//   inside WKWebView, including multi-select. A native upgrade arrives with
//   open-in handling (docs/ios/capacitor-plan.md Spike 5).
// - API keys on web: memory-only by design (same rule as the Tauri shell's
//   apiKeyStore). Keychain/SecureStorage is native-only.
//
// Native project requirements (gitignored ios/, applied via the Phase-2
// config patcher, not committed here): NSFaceIDUsageDescription for the
// biometric gate.

import { BiometricAuth } from "@aparajita/capacitor-biometric-auth"
import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage"
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"
import { Preferences } from "@capacitor/preferences"
import { Share } from "@capacitor/share"

import { isNativeCapacitorSync } from "@/lib/isNative"

/** True only inside the Capacitor native shell. All branches key off this. */
export function isNative(): boolean {
  return isNativeCapacitorSync()
}

export type HapticKind = "light" | "medium" | "success" | "error"

/** Best-effort tactile feedback. No-op on web; never throws anywhere. */
export async function haptic(kind: HapticKind): Promise<void> {
  if (!isNative()) return
  try {
    if (kind === "success" || kind === "error") {
      await Haptics.notification({
        type: kind === "success" ? NotificationType.Success : NotificationType.Error,
      })
    } else {
      await Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light })
    }
  } catch {
    // Haptics must never break the flow that triggered them.
  }
}

/** Backup filename with hour-minute disambiguation (same-day shares collide otherwise). */
export function backupFilename(at = new Date()): string {
  const stamp = at.toISOString().slice(0, 16).replaceAll(":", "-")
  return `budgetlens-backup-${stamp}.json`
}

function downloadOnWeb(filename: string, contents: string): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return
  const blob = new Blob([contents], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Export a JSON backup: native Share sheet (via a Documents file) on iOS,
 * browser download everywhere else. Resolves once the share is dismissed or
 * the download starts; never rejects on user cancellation.
 */
export async function shareBackupFile(filename: string, contents: string): Promise<void> {
  if (!isNative()) {
    downloadOnWeb(filename, contents)
    return
  }
  const saved = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  })
  await Share.share({ title: "BudgetLens backup", url: saved.uri })
}

// In-memory key store for web (memory-only by design; mirrors the Tauri
// shell). Native uses Keychain via SecureStorage with ThisDeviceOnly access:
// keys never migrate to other devices through backups.
const memoryKeys = new Map<string, string>()

function keyAccount(provider: string): string {
  return `assistant.${provider}`
}

/** Remembered key for this provider, or null when nothing is stored. Never throws. */
export async function loadAssistantKey(provider: string): Promise<string | null> {
  if (!isNative()) return memoryKeys.get(keyAccount(provider)) ?? null
  try {
    const value = await SecureStorage.get(keyAccount(provider))
    return typeof value === "string" && value ? value : null
  } catch {
    return null
  }
}

/** Best-effort persist. Empty keys are never stored. Never throws. */
export async function saveAssistantKey(provider: string, key: string): Promise<void> {
  if (!key) return
  if (!isNative()) {
    memoryKeys.set(keyAccount(provider), key)
    return
  }
  try {
    await SecureStorage.set(
      keyAccount(provider),
      key,
      false,
      false,
      KeychainAccess.whenUnlockedThisDeviceOnly,
    )
  } catch {
    // Keychain unavailable (locked store): session still works in memory.
    memoryKeys.set(keyAccount(provider), key)
  }
}

/** Best-effort forget. Missing entries are not an error. Never throws. */
export async function clearAssistantKey(provider: string): Promise<void> {
  memoryKeys.delete(keyAccount(provider))
  if (!isNative()) return
  try {
    await SecureStorage.remove(keyAccount(provider))
  } catch {
    // Best-effort; in-memory state is already cleared.
  }
}

export interface BiometricsStatus {
  available: boolean
  biometryType: string
}

/** Whether the device can do a biometric/device-credential gate. Never throws. */
export async function checkBiometrics(): Promise<BiometricsStatus> {
  if (!isNative()) return { available: false, biometryType: "none" }
  try {
    const result = await BiometricAuth.checkBiometry()
    return { available: result.isAvailable, biometryType: String(result.biometryType) }
  } catch {
    return { available: false, biometryType: "none" }
  }
}

/**
 * Face ID / Touch ID challenge with device-passcode fallback.
 * Resolves true on success, false on cancel/failure/lockout — never throws,
 * so callers treat false as "stay locked" without error UI.
 * Requires NSFaceIDUsageDescription in the native project (see header note).
 */
export async function requestBiometricUnlock(reason: string): Promise<boolean> {
  if (!isNative()) return false
  try {
    await BiometricAuth.authenticate({ reason, allowDeviceCredential: true })
    return true
  } catch {
    return false
  }
}

// Automatic daily backup on suspend (native only).
//
// Single overwritten file, no rotation bloat. Timestamp persistence uses
// Preferences (string millis); the enabled toggle lives in localStorage
// (see features/settings/auto-backup.ts). Everything here is best-effort
// and web-safe: web paths no-op so unattended downloads never fire.

/** Single auto-backup file in Documents, overwritten on every run. */
export const AUTO_BACKUP_FILENAME = "budgetlens-auto-backup.json"

/** Preferences key holding the last auto-backup epoch millis. */
export const AUTO_BACKUP_LAST_KEY = "budgetlens.auto-backup.last"

/** Minimum age of the last auto-backup before another one runs (24h). */
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Last auto-backup epoch millis, or null when never/invalid. Never throws. */
export async function readAutoBackupLastTimestamp(): Promise<number | null> {
  if (!isNative()) return null
  try {
    const { value } = await Preferences.get({ key: AUTO_BACKUP_LAST_KEY })
    if (value === null) return null
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

/** Best-effort persist of the last auto-backup time. Never throws. */
export async function writeAutoBackupLastTimestamp(nowMs: number): Promise<void> {
  if (!isNative()) return
  try {
    if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs <= 0) return
    await Preferences.set({ key: AUTO_BACKUP_LAST_KEY, value: String(Math.floor(nowMs)) })
  } catch {
    // Best-effort; the next suspend simply retries.
  }
}

/**
 * Overwrite Documents/budgetlens-auto-backup.json. No-op on web
 * (unattended downloads are unreliable/blocked). Never throws.
 */
export async function writeAutoBackupFile(contents: string): Promise<void> {
  if (!isNative()) return
  try {
    await Filesystem.writeFile({
      path: AUTO_BACKUP_FILENAME,
      data: contents,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
  } catch {
    // Best-effort; suspend must never break the UI.
  }
}
