// Single transport seam for demo mode (PR2's Worker relay builds on this and
// nothing else): every demo baseURL/key decision flows through
// resolveDemoEndpoint(), and every "is this the demo path?" check flows
// through isDemoRequest().

export const DEMO_DIRECT_BASE_URL = "https://openrouter.ai/api/v1"

export const DEMO_PROVIDER_ID = "openrouter-demo" as const

export interface DemoEndpoint {
  baseURL: string
  apiKey: string
}

function demoKey(): string {
  const raw = import.meta.env.VITE_OPENROUTER_DEMO_KEY
  return typeof raw === "string" ? raw.trim() : ""
}

/** Baked-key direct endpoint, or null when no demo key was baked in (local dev). */
export function resolveDemoEndpoint(): DemoEndpoint | null {
  const apiKey = demoKey()
  if (!apiKey) return null
  return { baseURL: DEMO_DIRECT_BASE_URL, apiKey }
}

/** True when demo mode can run in this build (direct key baked in). */
export function isDemoModeAvailable(): boolean {
  return resolveDemoEndpoint() !== null
}

/**
 * True when a request would spend the shared demo key, so the free-model
 * allowlist must apply. Detects the demo key even if it was pasted into a
 * BYOK preset's key field.
 */
export function isDemoRequest(baseURL: string, apiKey: string): boolean {
  void baseURL
  const key = demoKey()
  return key.length > 0 && apiKey === key
}
