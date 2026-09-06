import { describe, expect, it } from "vitest"

import {
  NOTIFICATIONS_ENABLED_KEY,
  NOTIFICATIONS_FIRED_KEY,
  readFiredKeys,
  readNotificationsEnabled,
  writeFiredKeys,
  writeNotificationsEnabled,
} from "@/features/notifications/preferences"

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  } satisfies Storage
}

describe("notification toggle preference", () => {
  it("defaults OFF when nothing is stored", () => {
    expect(readNotificationsEnabled(memoryStorage())).toBe(false)
  })

  it("rejects unknown values as OFF", () => {
    expect(readNotificationsEnabled(memoryStorage({ [NOTIFICATIONS_ENABLED_KEY]: "yes" }))).toBe(
      false,
    )
  })

  it("round-trips explicit choices", () => {
    const storage = memoryStorage()
    writeNotificationsEnabled(storage, true)
    expect(readNotificationsEnabled(storage)).toBe(true)
    writeNotificationsEnabled(storage, false)
    expect(readNotificationsEnabled(storage)).toBe(false)
  })

  it("treats throwing storage as OFF and never throws on write", () => {
    const broken = {
      getItem: () => {
        throw new Error("locked")
      },
      setItem: () => {
        throw new Error("locked")
      },
    }
    expect(readNotificationsEnabled(broken)).toBe(false)
    expect(() => writeNotificationsEnabled(broken, true)).not.toThrow()
  })
})

describe("fired reminder keys", () => {
  it("starts empty and round-trips", () => {
    const storage = memoryStorage()
    expect(readFiredKeys(storage)).toEqual([])
    writeFiredKeys(storage, [], ["budget:Groceries:2026-09:80"])
    expect(readFiredKeys(storage)).toEqual(["budget:Groceries:2026-09:80"])
  })

  it("dedupes and keeps only the newest entries", () => {
    const storage = memoryStorage()
    writeFiredKeys(storage, ["a", "b"], ["b", "c"])
    expect(readFiredKeys(storage)).toEqual(["a", "b", "c"])
  })

  it("caps growth so the list cannot bloat", () => {
    const storage = memoryStorage()
    const many = Array.from({ length: 250 }, (_, index) => `key-${index}`)
    writeFiredKeys(storage, [], many)
    const keys = readFiredKeys(storage)
    expect(keys).toHaveLength(200)
    expect(keys.at(-1)).toBe("key-249")
    expect(keys).not.toContain("key-0")
  })

  it("treats corrupt payloads as empty", () => {
    expect(readFiredKeys(memoryStorage({ [NOTIFICATIONS_FIRED_KEY]: "{" }))).toEqual([])
    expect(readFiredKeys(memoryStorage({ [NOTIFICATIONS_FIRED_KEY]: '"nope"' }))).toEqual([])
  })

  it("never throws on hostile storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("locked")
      },
      setItem: () => {
        throw new Error("locked")
      },
      removeItem: () => undefined,
    }
    expect(readFiredKeys(broken)).toEqual([])
    expect(() => writeFiredKeys(broken, [], ["x"])).not.toThrow()
  })
})
