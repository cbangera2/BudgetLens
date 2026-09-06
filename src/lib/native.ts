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
import type { PermissionState } from "@capacitor/core"
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"
import { LocalNotifications } from "@capacitor/local-notifications"
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
    // A failed read fails safe: the orchestrator treats null as "run".
    return null
  }
}

/**
 * Persist the last auto-backup time. No-op on web. Rejects when the native
 * write fails so the orchestrator can skip the "backed-up" outcome and
 * preserve the prior throttle state (the backup file is simply rewritten on
 * the next suspend). Invalid timestamps return silently without writing.
 */
export async function writeAutoBackupLastTimestamp(nowMs: number): Promise<void> {
  if (!isNative()) return
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs) || nowMs <= 0) return
  await Preferences.set({ key: AUTO_BACKUP_LAST_KEY, value: String(Math.floor(nowMs)) })
}

/**
 * Overwrite Documents/budgetlens-auto-backup.json. No-op on web
 * (unattended downloads are unreliable/blocked). Rejects when the native
 * write fails so the caller skips advancing the throttle timestamp; the
 * suspend orchestrator catches this and resolves "skipped-error".
 */
export async function writeAutoBackupFile(contents: string): Promise<void> {
  if (!isNative()) return
  await Filesystem.writeFile({
    path: AUTO_BACKUP_FILENAME,
    data: contents,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
  })
}

// On-device budget + bill reminders via @capacitor/local-notifications.
//
// Local notifications only — never remote push (no Apple Developer account,
// no server). Web paths no-op so jsdom tests, desktop builds, and GitHub
// Pages stay green with zero native runtime. Errors propagate (except where
// noted) so the scheduler in features/notifications can report a
// skipped-error status and degrade silently in the UI.

export interface ReminderNotification {
  /** Stable engine key, e.g. "budget:Groceries:2026-09:80". Stored in extra. */
  key: string
  title: string
  body: string
}

export interface PendingReminderInfo {
  id: number
  key: string | null
}

/**
 * Stable numeric id for an engine key. The plugin requires 32-bit int ids;
 * FNV-1a over the full UTF-16 code units, folded into 1..2_147_483_647, keeps
 * them positive and deterministic so re-deriving the same trigger never
 * duplicates a pending notification.
 */
export function reminderNumericId(key: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (Math.abs(hash | 0) % 2_147_483_646) + 1
}

/** Notification display permission. "denied" on web so callers stay dormant. */
export async function checkReminderPermission(): Promise<PermissionState> {
  if (!isNative()) return "denied"
  const status = await LocalNotifications.checkPermissions()
  return status.display
}

/**
 * Request display permission. Call ONLY when the user enables reminders
 * (interruptive by nature). Web resolves "denied" without touching plugins.
 */
export async function requestReminderPermission(): Promise<PermissionState> {
  if (!isNative()) return "denied"
  const status = await LocalNotifications.requestPermissions()
  return status.display
}

/**
 * Schedule reminders for immediate delivery (computed triggers are already
 * due: a crossed threshold or a charge days away). No-op on web. Rejects when
 * the native schedule fails so the scheduler can skip persisting fired keys.
 */
export async function scheduleReminderNotifications(
  reminders: readonly ReminderNotification[],
): Promise<void> {
  if (!isNative()) return
  if (reminders.length === 0) return
  await LocalNotifications.schedule({
    notifications: reminders.map((reminder) => ({
      id: reminderNumericId(reminder.key),
      title: reminder.title,
      body: reminder.body,
      extra: { reminderKey: reminder.key },
    })),
  })
}

/**
 * Cancel the given pending ids, or every pending notification when ids is
 * omitted (toggle-off path). No-op on web. Rejects on native failure.
 */
export async function cancelReminderNotifications(ids?: readonly number[]): Promise<void> {
  if (!isNative()) return
  if (ids === undefined) {
    await LocalNotifications.cancelAll()
    return
  }
  if (ids.length === 0) return
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) })
}

/** Pending notifications with our engine keys recovered from extra. Web: []. */
export async function listPendingReminderKeys(): Promise<PendingReminderInfo[]> {
  if (!isNative()) return []
  const pending = await LocalNotifications.getPending()
  return pending.notifications.map((notification) => ({
    id: notification.id,
    key: reminderKeyOf(notification.extra),
  }))
}

function reminderKeyOf(extra: unknown): string | null {
  if (typeof extra !== "object" || extra === null) return null
  if (!("reminderKey" in extra)) return null
  const key: unknown = extra.reminderKey
  return typeof key === "string" ? key : null
}

// ---------------------------------------------------------------------------
// Widget snapshot bridge (WidgetKit widget + Siri App Intent).
//
// Contract: `src/features/widget-bridge/` builds a SMALL versioned JSON
// payload (net-worth latest + delta, month spend vs budget, top categories)
// and hands the serialized string here. This module is the ONLY sink.
//
// Delivery ladder (documented fallback chain):
// 1. App-group container (future): the Widget extension cannot read the host
//    app's Documents directory, so the snapshot must ultimately live in the
//    shared App Group container. Reaching it from JS needs a tiny native
//    file-mover (FileManager.containerURL(forSecurityApplicationGroupIdentifier:)
//    cannot be addressed through the stock Filesystem plugin), which lands in
//    the deferred device-validation pass with the entitlement from
//    scripts/ios-patcher.mjs. Until then the "app-group" sink is reported but
//    never claimed.
// 2. Documents staging (native today): written via the stock Filesystem
//    plugin so device-pass validation can already assert bytes on disk.
// 3. localStorage scratch (web): debugging only, keyed below; never shipped
//    to native, never a source of truth.
//
// When the App Group is unconfigured the group-container write is a graceful
// no-op (never throws); callers treat `ok: false` as "widget shows its
// placeholder until the next successful refresh".
// ---------------------------------------------------------------------------

/** Staged snapshot filename inside Documents (pre-app-group handoff). */
export const WIDGET_SNAPSHOT_FILENAME = "budgetlens-widget-snapshot.json"

/** Web-only localStorage scratch key for the latest widget payload. */
export const WIDGET_SNAPSHOT_STORAGE_KEY = "budgetlens.widget-snapshot"

export type WidgetSnapshotSink = "app-group" | "documents-staging" | "local-storage" | "noop"

export interface WidgetSnapshotWriteResult {
  ok: boolean
  via: WidgetSnapshotSink
  reason?: string
}

function readWebScratch(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeWebScratch(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false
    localStorage.setItem(key, value)
    return true
  } catch {
    // Private mode / quota: the widget simply keeps its previous snapshot.
    return false
  }
}

/**
 * Persist a serialized widget snapshot for the native widget to read. Never
 * throws: every failure mode resolves to `{ ok: false, via: "noop" }` with a
 * reason, so widget refreshes can never break the finance flow.
 */
export async function writeWidgetSnapshot(json: string): Promise<WidgetSnapshotWriteResult> {
  if (typeof json !== "string" || !json) {
    return { ok: false, via: "noop", reason: "empty-payload" }
  }
  if (!isNative()) {
    const stored = writeWebScratch(WIDGET_SNAPSHOT_STORAGE_KEY, json)
    return stored
      ? { ok: true, via: "local-storage" }
      : { ok: false, via: "noop", reason: "web-storage-unavailable" }
  }
  try {
    await Filesystem.writeFile({
      path: WIDGET_SNAPSHOT_FILENAME,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return {
      ok: true,
      via: "documents-staging",
      reason: "app-group-handoff-pending-device-pass",
    }
  } catch (error) {
    return {
      ok: false,
      via: "noop",
      reason: error instanceof Error ? error.message : "native-write-failed",
    }
  }
}

/**
 * Read back the staged snapshot (Documents on native, localStorage scratch
 * on web). Debugging aid for the widget bridge; never throws.
 */
export async function readStagedWidgetSnapshot(): Promise<string | null> {
  if (!isNative()) return readWebScratch(WIDGET_SNAPSHOT_STORAGE_KEY)
  try {
    const result = await Filesystem.readFile({
      path: WIDGET_SNAPSHOT_FILENAME,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    return typeof result.data === "string" ? result.data : null
  } catch {
    return null
  }
}

// Receipt photos (feature: src/features/receipts/*). Images live OUTSIDE the
// Dexie finance tables and JSON backups so backups stay small; native bytes
// live in the app-data directory while web bytes use OPFS with an IndexedDB
// fallback (see features/receipts/storage.ts). Thumbnails arrive here already
// downscaled to JPEG (see features/receipts/downscale.ts).

/** Receipt thumbnails under the app-data directory, keyed by content hash. */
const RECEIPT_FILE_FOLDER = "receipts"

function receiptFilePath(hash: string): string {
  return `${RECEIPT_FILE_FOLDER}/${hash}.jpg`
}

function base64ToReceiptBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * Persist a downscaled receipt thumbnail in the app-data directory. No-op on
 * web. Rejects when the native write fails so the caller can surface an
 * attach error instead of recording a reference with no bytes behind it.
 */
export async function writeReceiptFile(hash: string, base64Data: string): Promise<void> {
  if (!isNative()) return
  try {
    await Filesystem.mkdir({
      path: RECEIPT_FILE_FOLDER,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // The folder already exists on repeat captures.
  }
  await Filesystem.writeFile({
    path: receiptFilePath(hash),
    data: base64Data,
    directory: Directory.Data,
  })
}

/**
 * Read a receipt thumbnail, or null when missing/unreadable. Never throws.
 */
export async function readReceiptFile(hash: string): Promise<Blob | null> {
  if (!isNative()) return null
  try {
    const result = await Filesystem.readFile({
      path: receiptFilePath(hash),
      directory: Directory.Data,
    })
    if (result.data instanceof Blob) return result.data
    if (typeof result.data === "string" && result.data.length > 0) {
      return new Blob([base64ToReceiptBytes(result.data)], { type: "image/jpeg" })
    }
    return null
  } catch {
    return null
  }
}

/**
 * Best-effort delete of a receipt thumbnail. Missing files are already gone.
 * Never throws.
 */
export async function deleteReceiptFile(hash: string): Promise<void> {
  if (!isNative()) return
  try {
    await Filesystem.deleteFile({ path: receiptFilePath(hash), directory: Directory.Data })
  } catch {
    // Missing files are already gone.
  }
}
