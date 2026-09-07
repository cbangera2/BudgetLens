import { describe, expect, it, vi } from "vitest"

import {
  ASSISTANT_OPEN_EVENT,
  prefillAssistantComposer,
  requestAssistantWithQuestion,
} from "@/features/palette/assistant-bridge"
import { PALETTE_USAGE_KEY, readUsage, recordUsage } from "@/features/palette/recents"

function memoryStore(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  backing: Map<string, string>
} {
  const backing = new Map<string, string>()
  return {
    backing,
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
  }
}

describe("palette usage tracking", () => {
  it("starts empty and records runs most-recent-first", () => {
    const store = memoryStore()
    expect(readUsage(store)).toEqual([])
    recordUsage(store, "go-budgets")
    recordUsage(store, "go-settings")
    recordUsage(store, "go-budgets")
    expect(readUsage(store)).toEqual(["go-budgets", "go-settings"])
  })

  it("ignores malformed payloads", () => {
    const store = memoryStore()
    store.backing.set(PALETTE_USAGE_KEY, "not-json")
    expect(readUsage(store)).toEqual([])
    store.backing.set(PALETTE_USAGE_KEY, JSON.stringify({ "go-budgets": 2 }))
    expect(readUsage(store)).toEqual([])
    store.backing.set(PALETTE_USAGE_KEY, JSON.stringify(["go-budgets", 42, ""]))
    expect(readUsage(store)).toEqual(["go-budgets"])
  })
})

describe("assistant bridge", () => {
  it("dispatches the open event carrying the preset question", () => {
    const seen: string[] = []
    const handler = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        seen.push(event.detail)
      }
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, handler)
    try {
      requestAssistantWithQuestion("Am I over budget anywhere?")
      expect(seen).toEqual(["Am I over budget anywhere?"])
    } finally {
      window.removeEventListener(ASSISTANT_OPEN_EVENT, handler)
      window.localStorage.clear()
    }
  })

  it("opens without touching storage", () => {
    const seen: string[] = []
    const handler = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        seen.push(event.detail)
      }
    }
    const write = vi.spyOn(window.localStorage, "setItem")
    window.addEventListener(ASSISTANT_OPEN_EVENT, handler)
    try {
      requestAssistantWithQuestion("Am I over budget anywhere?")
      expect(seen).toEqual(["Am I over budget anywhere?"])
      expect(write).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(ASSISTANT_OPEN_EVENT, handler)
      write.mockRestore()
      window.localStorage.clear()
    }
  })

  it("prefills the composer when mounted and reports when absent", () => {
    expect(prefillAssistantComposer("hello?")).toBe(false)
    const area = document.createElement("textarea")
    area.setAttribute("aria-label", "Ask the assistant")
    document.body.append(area)
    try {
      expect(prefillAssistantComposer("hello?")).toBe(true)
      expect(area.value).toBe("hello?")
      expect(document.activeElement).toBe(area)
    } finally {
      area.remove()
    }
  })
})
