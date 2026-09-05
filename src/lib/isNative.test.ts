import { afterEach, describe, expect, it } from "vitest"

import { isNativeCapacitorSync } from "@/lib/isNative"

declare global {
  interface Window {
    webkit?: { messageHandlers?: { bridge?: unknown } } | undefined
  }
}

afterEach(() => {
  window.webkit = undefined
})

describe("isNativeCapacitor runtime detection", () => {
  it("reports false on plain web (no native bridge)", () => {
    expect(isNativeCapacitorSync()).toBe(false)
  })

  it("reports true when the iOS WKWebView bridge is present", () => {
    window.webkit = { messageHandlers: { bridge: {} } }
    expect(isNativeCapacitorSync()).toBe(true)
  })
})
