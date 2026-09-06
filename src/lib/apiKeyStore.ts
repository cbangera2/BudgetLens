import { invoke } from "@tauri-apps/api/core"

import { isNativeCapacitorSync } from "@/lib/isNative"
import { isTauriSync } from "@/lib/isTauri"
import {
  clearAssistantKey as clearNativeKey,
  loadAssistantKey as loadNativeKey,
  saveAssistantKey as saveNativeKey,
} from "@/lib/native"

// OS-keychain storage for BYOK assistant keys (desktop via Tauri invoke,
// native iOS shell via SecureStorage). Service/account layout: service
// "budgetlens", account "assistant.<provider>".
// Web builds are memory-only by design: load resolves null, save/clear are no-ops.

const SERVICE = "budgetlens"

function accountFor(provider: string): string {
  return `assistant.${provider}`
}

/** Remembered key for this provider, or null on web / when nothing is stored. */
export async function loadAssistantKey(provider: string): Promise<string | null> {
  if (isNativeCapacitorSync()) return loadNativeKey(provider)
  if (!isTauriSync()) return null
  try {
    const secret = await invoke<string | null>("get_secret", {
      service: SERVICE,
      account: accountFor(provider),
    })
    return typeof secret === "string" && secret ? secret : null
  } catch {
    return null
  }
}

/** Best-effort persist. Empty keys are never stored. */
export async function saveAssistantKey(provider: string, key: string): Promise<void> {
  if (isNativeCapacitorSync()) {
    await saveNativeKey(provider, key)
    return
  }
  if (!isTauriSync() || !key) return
  try {
    await invoke("set_secret", { service: SERVICE, account: accountFor(provider), secret: key })
  } catch {
    // Keychain unavailable (locked store, no secret daemon): session still works.
  }
}

/** Best-effort forget. Missing entries are not an error. */
export async function clearAssistantKey(provider: string): Promise<void> {
  if (isNativeCapacitorSync()) {
    await clearNativeKey(provider)
    return
  }
  if (!isTauriSync()) return
  try {
    await invoke("delete_secret", { service: SERVICE, account: accountFor(provider) })
  } catch {
    // Best-effort; in-memory state is the source of truth for the session.
  }
}
