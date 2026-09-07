import {
  clearInsightsDismissals,
  dismissInsight,
  dismissInsightsCard,
  INSIGHTS_DISMISSAL_STORAGE_KEY,
  INSIGHTS_DISMISSAL_STORAGE_VERSION,
  isCardDismissed,
  isInsightDismissed,
  readInsightsDismissals,
  restoreDigestInsights,
  restoreInsight,
  restoreInsightsCard,
} from "./dismissal"

function memoryStorage(): Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "clear" | "key" | "length"
> {
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

describe("insights dismissal persistence", () => {
  it("persists per-insight dismissals under a versioned key", () => {
    const storage = memoryStorage()
    const state = dismissInsight(storage, "2026-08>2026-09|mover-up|groceries")

    expect(isInsightDismissed(state, "2026-08>2026-09|mover-up|groceries")).toBe(true)
    const raw = storage.getItem(INSIGHTS_DISMISSAL_STORAGE_KEY)
    expect(raw).toContain(`"version":${INSIGHTS_DISMISSAL_STORAGE_VERSION}`)
    expect(raw).toContain("2026-08>2026-09|mover-up|groceries")

    // A fresh read sees the persisted dismissal.
    expect(
      isInsightDismissed(readInsightsDismissals(storage), "2026-08>2026-09|mover-up|groceries"),
    ).toBe(true)
    expect(isInsightDismissed(readInsightsDismissals(storage), "other")).toBe(false)
  })

  it("persists whole-card dismissal per digest period", () => {
    const storage = memoryStorage()
    const state = dismissInsightsCard(storage, "2026-08>2026-09")

    expect(isCardDismissed(state, "2026-08>2026-09")).toBe(true)
    expect(isCardDismissed(state, "2026-09>2026-10")).toBe(false)
    expect(isCardDismissed(readInsightsDismissals(storage), "2026-08>2026-09")).toBe(true)
  })

  it("restores single insights, digest batches, and whole cards", () => {
    const storage = memoryStorage()
    dismissInsight(storage, "2026-08>2026-09|mover-up|groceries")
    dismissInsight(storage, "2026-08>2026-09|new-merchant|juniper")
    dismissInsight(storage, "2026-09>2026-10|mover-up|groceries")
    dismissInsightsCard(storage, "2026-08>2026-09")

    let state = restoreInsight(storage, "2026-08>2026-09|mover-up|groceries")
    expect(isInsightDismissed(state, "2026-08>2026-09|mover-up|groceries")).toBe(false)
    expect(isInsightDismissed(state, "2026-08>2026-09|new-merchant|juniper")).toBe(true)

    state = restoreDigestInsights(storage, "2026-08>2026-09")
    expect(isInsightDismissed(state, "2026-08>2026-09|new-merchant|juniper")).toBe(false)
    // Other periods are untouched.
    expect(isInsightDismissed(state, "2026-09>2026-10|mover-up|groceries")).toBe(true)

    state = restoreInsightsCard(storage, "2026-08>2026-09")
    expect(isCardDismissed(state, "2026-08>2026-09")).toBe(false)
  })

  it("chains sequential actions on in-memory state when persistence throws", () => {
    const store = new Map<string, string>()
    const throwing: Pick<
      Storage,
      "getItem" | "setItem" | "removeItem" | "clear" | "key" | "length"
    > = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: () => {
        throw new Error("storage denied")
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
    // Mirror the section's functional updates: each action builds on the
    // latest in-memory state instead of rereading storage.
    let state = readInsightsDismissals(throwing)
    state = dismissInsight(throwing, "2026-08>2026-09|mover-up|groceries", state)
    state = dismissInsight(throwing, "2026-08>2026-09|new-merchant|juniper", state)
    expect(isInsightDismissed(state, "2026-08>2026-09|mover-up|groceries")).toBe(true)
    expect(isInsightDismissed(state, "2026-08>2026-09|new-merchant|juniper")).toBe(true)
    state = restoreInsight(throwing, "2026-08>2026-09|mover-up|groceries", state)
    expect(isInsightDismissed(state, "2026-08>2026-09|mover-up|groceries")).toBe(false)
    expect(isInsightDismissed(state, "2026-08>2026-09|new-merchant|juniper")).toBe(true)
  })

  it("ignores corrupt or unversioned payloads and clears on demand", () => {
    const storage = memoryStorage()
    storage.setItem(INSIGHTS_DISMISSAL_STORAGE_KEY, "not-json")
    expect(readInsightsDismissals(storage).insights.size).toBe(0)

    storage.setItem(
      INSIGHTS_DISMISSAL_STORAGE_KEY,
      JSON.stringify({ version: 999, dismissedInsightIds: ["x"], dismissedCards: [] }),
    )
    expect(readInsightsDismissals(storage).insights.size).toBe(0)

    dismissInsight(storage, "id")
    clearInsightsDismissals(storage)
    expect(storage.getItem(INSIGHTS_DISMISSAL_STORAGE_KEY)).toBeNull()
  })
})
