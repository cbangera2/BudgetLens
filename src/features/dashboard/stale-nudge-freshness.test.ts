import {
  STALE_NUDGE_EMPTY_KEY,
  STALE_NUDGE_STORAGE_KEY,
  STALE_NUDGE_STORAGE_VERSION,
  STALE_NUDGE_THRESHOLD_MS,
  clearStaleNudgeDismissal,
  dismissStaleNudge,
  getDaysSinceImport,
  getLatestImportAt,
  getStaleNudgeDismissalKey,
  getStaleNudgeFreshness,
  isStaleNudgeDismissed,
  readStaleNudgeDismissal,
  shouldShowStaleNudge,
} from "./stale-nudge-freshness"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date("2026-09-07T12:00:00.000Z")

function batch(importedAt: string) {
  return {
    id: `batch-${importedAt}`,
    kind: "transactions" as const,
    sourceName: "synthetic-transactions.csv",
    sourceHash: `hash-${importedAt}`,
    rowCount: 2,
    importedCount: 2,
    skippedCount: 0,
    replacedCount: 0,
    importedAt,
  }
}

function memoryStorage() {
  const store = new Map<string, string>()
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
  }
}

describe("stale-nudge freshness", () => {
  it("selects the latest import timestamp", () => {
    const batches = [
      batch("2026-08-01T12:00:00.000Z"),
      batch("2026-09-01T12:00:00.000Z"),
      batch("2026-07-01T12:00:00.000Z"),
    ]
    expect(getLatestImportAt(batches)).toBe("2026-09-01T12:00:00.000Z")
  })

  it("ignores invalid timestamps and treats all-invalid as empty", () => {
    expect(getLatestImportAt([batch("not-a-date")])).toBeNull()
    expect(getStaleNudgeFreshness([batch("not-a-date")], NOW).variant).toBe("empty")
  })

  it("counts whole days since import", () => {
    expect(getDaysSinceImport("2026-09-07T12:00:00.000Z", NOW)).toBe(0)
    expect(getDaysSinceImport("2026-09-06T12:00:00.000Z", NOW)).toBe(1)
    expect(getDaysSinceImport("2026-07-24T12:00:00.000Z", NOW)).toBe(45)
    expect(getDaysSinceImport("2026-09-08T12:00:00.000Z", NOW)).toBe(0)
  })

  it("treats exactly 30 days as fresh and 30 days plus a moment as stale", () => {
    const exactly30 = new Date(NOW.getTime() - STALE_NUDGE_THRESHOLD_MS).toISOString()
    const justOver30 = new Date(NOW.getTime() - STALE_NUDGE_THRESHOLD_MS - 1).toISOString()
    expect(getStaleNudgeFreshness([batch(exactly30)], NOW).variant).toBe("fresh")
    const stale = getStaleNudgeFreshness([batch(justOver30)], NOW)
    expect(stale.variant).toBe("stale")
    expect(stale.daysSince).toBe(30)
  })

  it("marks 31 days as stale and fresh imports as fresh", () => {
    const old = new Date(NOW.getTime() - 31 * DAY_MS).toISOString()
    const recent = new Date(NOW.getTime() - 5 * DAY_MS).toISOString()
    expect(getStaleNudgeFreshness([batch(old)], NOW)).toMatchObject({
      variant: "stale",
      daysSince: 31,
      lastImportAt: old,
    })
    expect(getStaleNudgeFreshness([batch(recent)], NOW).variant).toBe("fresh")
    expect(getStaleNudgeFreshness([batch(NOW.toISOString())], NOW).variant).toBe("fresh")
  })

  it("selects the empty variant when no imports exist", () => {
    for (const empty of [[], undefined, null] as const) {
      const freshness = getStaleNudgeFreshness(empty, NOW)
      expect(freshness.variant).toBe("empty")
      expect(freshness.daysSince).toBeNull()
      expect(freshness.lastImportAt).toBeNull()
      expect(getStaleNudgeDismissalKey(freshness)).toBe(STALE_NUDGE_EMPTY_KEY)
    }
  })

  it("persists dismissal per import window and reappears for a new stale window", () => {
    const storage = memoryStorage()
    const first = new Date(NOW.getTime() - 45 * DAY_MS).toISOString()
    const second = new Date(NOW.getTime() - 60 * DAY_MS).toISOString()
    const firstFreshness = getStaleNudgeFreshness([batch(first)], NOW)
    const firstKey = getStaleNudgeDismissalKey(firstFreshness)

    expect(shouldShowStaleNudge(firstFreshness, storage)).toBe(true)
    dismissStaleNudge(storage, firstKey)
    expect(readStaleNudgeDismissal(storage)).toBe(firstKey)
    expect(isStaleNudgeDismissed(storage, firstKey)).toBe(true)
    expect(shouldShowStaleNudge(firstFreshness, storage)).toBe(false)

    const raw = storage.getItem(STALE_NUDGE_STORAGE_KEY)
    expect(raw).toContain(`"version":${STALE_NUDGE_STORAGE_VERSION}`)
    const secondFreshness = getStaleNudgeFreshness([batch(second)], NOW)
    expect(shouldShowStaleNudge(secondFreshness, storage)).toBe(true)

    clearStaleNudgeDismissal(storage)
    expect(shouldShowStaleNudge(firstFreshness, storage)).toBe(true)
  })

  it("reappears in the next 30-day stale window for the same import", () => {
    const storage = memoryStorage()
    const importedAt = new Date(NOW.getTime() - 45 * DAY_MS).toISOString()
    const dismissedAt = getStaleNudgeFreshness([batch(importedAt)], NOW)
    dismissStaleNudge(storage, getStaleNudgeDismissalKey(dismissedAt))
    expect(shouldShowStaleNudge(dismissedAt, storage)).toBe(false)

    const sameWindow = getStaleNudgeFreshness(
      [batch(importedAt)],
      new Date(NOW.getTime() + 5 * DAY_MS),
    )
    expect(sameWindow.variant).toBe("stale")
    expect(shouldShowStaleNudge(sameWindow, storage)).toBe(false)

    const nextWindow = getStaleNudgeFreshness(
      [batch(importedAt)],
      new Date(NOW.getTime() + 30 * DAY_MS),
    )
    expect(nextWindow.variant).toBe("stale")
    expect(shouldShowStaleNudge(nextWindow, storage)).toBe(true)
  })

  it("never shows when data is fresh and keeps empty dismissal scoped", () => {
    const storage = memoryStorage()
    const fresh = getStaleNudgeFreshness(
      [batch(new Date(NOW.getTime() - 2 * DAY_MS).toISOString())],
      NOW,
    )
    expect(shouldShowStaleNudge(fresh, storage)).toBe(false)

    const emptyFreshness = getStaleNudgeFreshness([], NOW)
    dismissStaleNudge(storage, getStaleNudgeDismissalKey(emptyFreshness))
    expect(shouldShowStaleNudge(emptyFreshness, storage)).toBe(false)
    const stale = getStaleNudgeFreshness(
      [batch(new Date(NOW.getTime() - 45 * DAY_MS).toISOString())],
      NOW,
    )
    expect(shouldShowStaleNudge(stale, storage)).toBe(true)
  })

  it("ignores versioned-out dismissal records", () => {
    const storage = memoryStorage()
    storage.setItem(STALE_NUDGE_STORAGE_KEY, JSON.stringify({ version: 999, dismissedFor: "x" }))
    expect(readStaleNudgeDismissal(storage)).toBeNull()
    storage.setItem(STALE_NUDGE_STORAGE_KEY, "not-json")
    expect(readStaleNudgeDismissal(storage)).toBeNull()
    expect(readStaleNudgeDismissal(null)).toBeNull()
  })
})
