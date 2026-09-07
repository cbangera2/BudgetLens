import { defaultTransactionFilters } from "./filtering"
import {
  createSavedView,
  deleteSavedView,
  loadSavedViews,
  persistSavedViews,
  renameSavedView,
  SAVED_VIEWS_KEY,
} from "./saved-views"

const filters = {
  ...defaultTransactionFilters,
  search: "amount:>100",
  from: "2026-01-01",
  to: "2026-12-31",
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  } satisfies Storage
}

describe("saved views", () => {
  it("creates views with trimmed names and synthetic timestamps", () => {
    const views = createSavedView([], "  Big spend  ", filters, "2026-09-07T00:00:00.000Z")
    expect(views).toHaveLength(1)
    expect(views[0]).toMatchObject({
      name: "Big spend",
      filters,
      createdAt: "2026-09-07T00:00:00.000Z",
    })
    expect(views[0]?.id).toBeTruthy()
  })

  it("assigns unique ids and rejects blank names", () => {
    const first = createSavedView([], "one", filters)
    const second = createSavedView(first, "two", filters)
    expect(second.map(({ id }) => id)).toHaveLength(new Set(second.map(({ id }) => id)).size)
    expect(createSavedView(second, "   ", filters)).toHaveLength(2)
  })

  it("renames views and ignores blank or unknown renames", () => {
    const views = createSavedView([], "old", filters, "2026-09-07T00:00:00.000Z")
    const id = views[0]?.id ?? ""
    const renamed = renameSavedView(views, id, "new", "2026-09-08T00:00:00.000Z")
    expect(renamed[0]).toMatchObject({ name: "new", updatedAt: "2026-09-08T00:00:00.000Z" })
    expect(renameSavedView(views, id, "   ")).toEqual(views)
    expect(renameSavedView(views, "missing", "new")).toEqual(views)
  })

  it("deletes views and ignores unknown ids", () => {
    const views = createSavedView([], "old", filters)
    const id = views[0]?.id ?? ""
    expect(deleteSavedView(views, id)).toEqual([])
    expect(deleteSavedView(views, "missing")).toEqual(views)
  })

  it("persists under the versioned key and reloads", () => {
    const storage = memoryStorage()
    const views = createSavedView([], "Big spend", filters)
    persistSavedViews(storage, views)
    expect(storage.getItem(SAVED_VIEWS_KEY)).toContain('"version":1')
    expect(loadSavedViews(storage)).toEqual(views)
  })

  it("migrates legacy-key payloads to the versioned key", () => {
    const legacy = [
      {
        id: "legacy-1",
        name: "Legacy",
        filters,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    const storage = memoryStorage({
      "budgetlens.savedViews": JSON.stringify({ version: 0, views: legacy }),
    })
    expect(loadSavedViews(storage)).toEqual(legacy)
    expect(JSON.parse(storage.getItem(SAVED_VIEWS_KEY) ?? "")).toMatchObject({ version: 1 })
  })

  it("drops stored views with malformed filter payloads", () => {
    const valid = createSavedView([], "Good", filters)[0]
    if (!valid) throw new Error("expected a valid view")
    const malformed = [
      {
        id: "bad-empty",
        name: "Bad",
        filters: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "bad-types",
        name: "Bad",
        filters: { ...filters, search: 42, merchants: "nope", sort: "newest" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    const storage = memoryStorage({
      [SAVED_VIEWS_KEY]: JSON.stringify({ version: 1, views: [...malformed, valid] }),
    })
    expect(loadSavedViews(storage)).toEqual([valid])
  })

  it("treats corrupt or missing payloads as an empty list", () => {
    expect(loadSavedViews(memoryStorage())).toEqual([])
    expect(loadSavedViews(memoryStorage({ [SAVED_VIEWS_KEY]: "not json" }))).toEqual([])
    expect(
      loadSavedViews(memoryStorage({ [SAVED_VIEWS_KEY]: JSON.stringify({ version: 1 }) })),
    ).toEqual([])
  })

  it("keeps saved filters intact for later application", () => {
    const views = createSavedView([], "Big spend", filters)
    expect(views[0]?.filters.search).toBe("amount:>100")
    expect(views[0]?.filters.from).toBe("2026-01-01")
  })
})
