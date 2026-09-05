// Runtime detection for the Tauri desktop shell (Tauri 2).
//
// Tauri 2 removed the v1 `window.__TAURI__` global: the supported async check
// is `isTauri()` from `@tauri-apps/api/core`, with the sync
// `window.__TAURI_INTERNALS__` presence check as a fallback for module-init
// paths that cannot await (e.g. router history selection).

import { isTauri } from "@tauri-apps/api/core"

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

/** Sync best-effort check. Safe to call at module scope. False on web/Pages. */
export function isTauriSync(): boolean {
  // oxlint-disable-next-line no-underscore-dangle -- Tauri 2 runtime global.
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined
}

/** Async authoritative check. False on web / GitHub Pages. */
export function isTauriAsync(): Promise<boolean> {
  try {
    return Promise.resolve(isTauri())
  } catch {
    return Promise.resolve(false)
  }
}
