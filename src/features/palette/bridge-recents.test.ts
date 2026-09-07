import { describe, expect, it, vi } from "vitest"

import {
  ASSISTANT_OPEN_EVENT,
  ASSISTANT_PENDING_QUESTION_KEY,
  prefillAssistantComposer,
  requestAssistantWithQuestion,
  takePendingAssistantQuestion,
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
  it("starts empty and counts runs", () => {
    const store = memoryStore()
    expect(readUsage(store)).toEqual({})
    recordUsage(store, "go-budgets", 100)
    recordUsage(store, "go-budgets", 200)
    expect(readUsage(store)["go-budgets"]).toEqual({ count: 2, lastUsed: 200 })
  })

  it("ignores malformed payloads", () => {
    const store = memoryStore()
    store.backing.set(PALETTE_USAGE_KEY, "not-json")
    expect(readUsage(store)).toEqual({})
    store.backing.set(PALETTE_USAGE_KEY, JSON.stringify({ "go-budgets": { count: "x" } }))
    expect(readUsage(store)).toEqual({})
  })
})

describe("assistant bridge", () => {
  it("dispatches the open event and stashes the preset question", () => {
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
      expect(window.sessionStorage.getItem(ASSISTANT_PENDING_QUESTION_KEY)).toBe(
        "Am I over budget anywhere?",
      )
    } finally {
      window.removeEventListener(ASSISTANT_OPEN_EVENT, handler)
      window.sessionStorage.clear()
      window.localStorage.clear()
    }
  })

  it("still opens the assistant when session storage writes fail", () => {
    const seen: string[] = []
    const handler = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        seen.push(event.detail)
      }
    }
    const write = vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("storage denied")
    })
    window.addEventListener(ASSISTANT_OPEN_EVENT, handler)
    try {
      requestAssistantWithQuestion("Am I over budget anywhere?")
      expect(seen).toEqual(["Am I over budget anywhere?"])
    } finally {
      window.removeEventListener(ASSISTANT_OPEN_EVENT, handler)
      write.mockRestore()
      window.sessionStorage.clear()
      window.localStorage.clear()
    }
  })

  it("takes the pending question exactly once", () => {
    const store = memoryStore()
    expect(takePendingAssistantQuestion(store)).toBeNull()
    store.backing.set(ASSISTANT_PENDING_QUESTION_KEY, "Where did my money go last month?")
    expect(takePendingAssistantQuestion(store)).toBe("Where did my money go last month?")
    expect(takePendingAssistantQuestion(store)).toBeNull()
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
