// Single transport seam for demo mode: every demo baseURL/key decision flows
// through resolveDemoEndpoint(), and every "is this the demo path?" check
// flows through isDemoRequest(). The Worker relay (PR2) switches over through
// this file only; callers are untouched.
//
// Modes (first match wins):
// 1. Relay (VITE_ASSISTANT_RELAY_URL set): demo resolves to {relayURL, no key}.
//    The key lives only as a Worker secret, never in the bundle.
// 2. Direct (VITE_OPENROUTER_DEMO_KEY baked in): demo talks to OpenRouter with
//    the shared key. Works before the Worker exists (progressive enhancement).
// 3. Neither: demo mode unavailable; the preset hides and the app behaves as
//    if demo never existed.

export const DEMO_DIRECT_BASE_URL = "https://openrouter.ai/api/v1"

export const DEMO_PROVIDER_ID = "openrouter-demo" as const

export interface DemoEndpoint {
  baseURL: string
  apiKey: string
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "")
}

/** App-side knob for the Cloudflare relay (repo secret VITE_ASSISTANT_RELAY_URL). */
function relayBaseURL(): string {
  const raw = import.meta.env.VITE_ASSISTANT_RELAY_URL
  return typeof raw === "string" ? stripTrailingSlashes(raw.trim()) : ""
}

function demoKey(): string {
  const raw = import.meta.env.VITE_OPENROUTER_DEMO_KEY
  return typeof raw === "string" ? raw.trim() : ""
}

export function resolveDemoEndpoint(): DemoEndpoint | null {
  const relay = relayBaseURL()
  if (relay) return { baseURL: relay, apiKey: "" }
  const apiKey = demoKey()
  if (!apiKey) return null
  return { baseURL: DEMO_DIRECT_BASE_URL, apiKey }
}

/** True when demo mode can run in this build (relay URL or baked key). */
export function isDemoModeAvailable(): boolean {
  return resolveDemoEndpoint() !== null
}

/**
 * True when a request would spend the shared demo key, so the free-model
 * allowlist must apply. Detects the demo key even if it was pasted into a
 * BYOK preset's key field. Kept as defense-in-depth alongside the relay's
 * server-side enforcement.
 */
export function isDemoRequest(baseURL: string, apiKey: string): boolean {
  const relay = relayBaseURL()
  if (relay && stripTrailingSlashes(baseURL.trim()) === relay) return true
  const key = demoKey()
  return key.length > 0 && apiKey === key
}
