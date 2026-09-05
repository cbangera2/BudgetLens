// Runtime detection for the Capacitor iOS shell.
//
// Capacitor.isNativePlatform() is sync and safe at module scope: it checks
// for the injected native bridge and returns false on plain web, GitHub
// Pages, and the Tauri desktop shell. Wrapped in try/catch so unit tests
// (jsdom, no bridge) stay green.

import { Capacitor } from "@capacitor/core"

/** True only inside the Capacitor native shell. False everywhere else. */
export function isNativeCapacitorSync(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
