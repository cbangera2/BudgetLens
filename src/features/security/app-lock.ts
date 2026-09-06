// Device app lock (Face ID / device passcode gate) state.
// Persisted under its own key so clearing assistant settings never silently
// disables it, and wiping app data (which clears budgetlens.* keys) does.
// Enforcement lives in the app shell; this module only stores the choice.

export type AppLockMode = "off" | "biometric"

export const APP_LOCK_KEY = "budgetlens.app-lock.v1"

export const APP_LOCK_EVENT = "budgetlens:app-lock-changed"

export function readAppLockMode(storage: Pick<Storage, "getItem">): AppLockMode {
  try {
    const raw = storage.getItem(APP_LOCK_KEY)
    if (!raw) return "off"
    const parsed: unknown = JSON.parse(raw) as unknown
    return parsed === "biometric" ? "biometric" : "off"
  } catch {
    return "off"
  }
}

export function writeAppLockMode(storage: Pick<Storage, "setItem">, mode: AppLockMode): void {
  try {
    storage.setItem(APP_LOCK_KEY, JSON.stringify(mode))
  } catch {
    // Private-mode storage may throw; the lock just defaults to off.
  }
  notifyAppLockChanged()
}

export function notifyAppLockChanged(): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(APP_LOCK_EVENT))
  }
}
