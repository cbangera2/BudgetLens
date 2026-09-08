import { afterEach, describe, expect, it, vi } from "vitest"

import { defaultAssistantLayout } from "./assistant-panel"

const LAYOUT_KEY = "budgetlens.assistant.layout.v1"

function stubMatchMedia(matchesCoarse: boolean): void {
  const factory = (query: string): MediaQueryList => {
    const listeners = new Set<() => void>()
    return {
      matches: query.includes("coarse") ? matchesCoarse : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => {
        listeners.forEach((listener) => listener())
        return false
      },
    } as MediaQueryList
  }
  vi.stubGlobal("matchMedia", factory)
  Object.defineProperty(window, "matchMedia", { configurable: true, value: factory })
}

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe("defaultAssistantLayout", () => {
  it("opens windowed on fine pointers with nothing stored", () => {
    stubMatchMedia(false)
    expect(defaultAssistantLayout().fullscreen).toBe(false)
  })

  it("opens fullscreen on touch-first devices with nothing stored", () => {
    stubMatchMedia(true)
    const layout = defaultAssistantLayout()
    expect(layout.fullscreen).toBe(true)
    expect(layout.size).toBe("m")
  })

  it("respects a stored opt-out on touch devices", () => {
    stubMatchMedia(true)
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ fullscreen: false, size: "m" }))
    expect(defaultAssistantLayout().fullscreen).toBe(false)
  })

  it("respects a stored fullscreen choice on desktop", () => {
    stubMatchMedia(false)
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ fullscreen: true, size: "l" }))
    const layout = defaultAssistantLayout()
    expect(layout.fullscreen).toBe(true)
    expect(layout.size).toBe("l")
  })
})
