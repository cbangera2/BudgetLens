import { describe, expect, it } from "vitest"

import {
  BILL_CREEP_DISMISSALS_KEY,
  dismissCreepKey,
  loadDismissedCreepKeys,
  restoreCreepKey,
  saveDismissedCreepKeys,
} from "./dismissals"

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
}

describe("dismissed creep persistence", () => {
  it("round-trips dismissed keys", () => {
    const storage = memoryStorage()
    expect(loadDismissedCreepKeys(storage)).toEqual(new Set())
    dismissCreepKey("acme streaming", storage)
    expect(loadDismissedCreepKeys(storage)).toEqual(new Set(["acme streaming"]))
    restoreCreepKey("acme streaming", storage)
    expect(loadDismissedCreepKeys(storage)).toEqual(new Set())
  })

  it("keeps dismissals across separate loads", () => {
    const storage = memoryStorage()
    saveDismissedCreepKeys(["acme streaming", "example news"], storage)
    expect(loadDismissedCreepKeys(storage)).toEqual(new Set(["acme streaming", "example news"]))
  })

  it("falls back to empty on corrupt, foreign, or version-mismatched payloads", () => {
    expect(loadDismissedCreepKeys(memoryStorage({ [BILL_CREEP_DISMISSALS_KEY]: "nope{" }))).toEqual(
      new Set(),
    )
    expect(
      loadDismissedCreepKeys(memoryStorage({ [BILL_CREEP_DISMISSALS_KEY]: '"just-a-string"' })),
    ).toEqual(new Set())
    expect(
      loadDismissedCreepKeys(
        memoryStorage({
          [BILL_CREEP_DISMISSALS_KEY]: JSON.stringify({ version: 999, keys: ["x"] }),
        }),
      ),
    ).toEqual(new Set())
  })

  it("never throws on hostile storage", () => {
    const hostile = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
      removeItem: () => {
        throw new Error("blocked")
      },
    }
    expect(loadDismissedCreepKeys(hostile)).toEqual(new Set())
    expect(() => saveDismissedCreepKeys(["x"], hostile)).not.toThrow()
    expect(() => dismissCreepKey("x", hostile)).not.toThrow()
    expect(() => restoreCreepKey("x", hostile)).not.toThrow()
  })
})
