import { describe, expect, it } from "vitest"

import {
  clearDemoManifest,
  DEMO_MANIFEST_KEY,
  readDemoManifest,
  writeDemoManifest,
} from "@/features/demo/demo-manifest"

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
}

describe("demo manifest", () => {
  it("round-trips recorded budget and group ids", () => {
    const storage = memoryStorage()
    writeDemoManifest({ budgetIds: ["b1"], groupIds: ["g1", "g2"] }, storage)
    expect(storage.getItem(DEMO_MANIFEST_KEY)).toContain("b1")
    expect(readDemoManifest(storage)).toEqual({ budgetIds: ["b1"], groupIds: ["g1", "g2"] })
  })

  it("returns null when missing, corrupt, or empty", () => {
    expect(readDemoManifest(memoryStorage())).toBeNull()
    expect(readDemoManifest(memoryStorage({ [DEMO_MANIFEST_KEY]: "not-json" }))).toBeNull()
    expect(readDemoManifest(memoryStorage({ [DEMO_MANIFEST_KEY]: JSON.stringify({}) }))).toBeNull()
    expect(
      readDemoManifest(
        memoryStorage({ [DEMO_MANIFEST_KEY]: JSON.stringify({ budgetIds: [], groupIds: [] }) }),
      ),
    ).toBeNull()
  })

  it("drops non-string entries and clears on demand", () => {
    const storage = memoryStorage({
      [DEMO_MANIFEST_KEY]: JSON.stringify({ budgetIds: ["b1", 42, null], groupIds: "nope" }),
    })
    expect(readDemoManifest(storage)).toEqual({ budgetIds: ["b1"], groupIds: [] })
    clearDemoManifest(storage)
    expect(readDemoManifest(storage)).toBeNull()
    expect(storage.getItem(DEMO_MANIFEST_KEY)).toBeNull()
  })
})
