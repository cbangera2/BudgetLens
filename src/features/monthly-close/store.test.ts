import {
  clearRecurringDecision,
  closeMonth,
  completeRecurringStep,
  completeTriageStep,
  dismissCloseBanner,
  getMonthRecord,
  isMonthClosed,
  isMonthSkipped,
  readMonthlyCloseStore,
  reopenMonth,
  setCloseStep,
  setRecurringDecision,
  shouldShowCloseBanner,
  skipCloseMonth,
  startClose,
  unskipCloseMonth,
  writeMonthlyCloseStore,
  MONTHLY_CLOSE_STORAGE_KEY,
  type MonthlyCloseStoreShape,
} from "./store"

function memoryStorage(): Storage {
  const backing = new Map<string, string>()
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size
    },
  } satisfies Storage
}

function emptyShape(): MonthlyCloseStoreShape {
  return { version: 1, months: {} }
}

describe("monthly close state machine", () => {
  it("starts, advances through triage and recurring, then closes", () => {
    let shape = emptyShape()
    shape = startClose(shape, "2026-08", "2026-09-01T00:00:00.000Z")
    expect(getMonthRecord(shape, "2026-08").started).toBe(true)
    expect(getMonthRecord(shape, "2026-08").step).toBe(1)

    shape = completeTriageStep(shape, "2026-08", false)
    expect(getMonthRecord(shape, "2026-08").step).toBe(2)
    expect(getMonthRecord(shape, "2026-08").triageSkipped).toBe(false)

    shape = setRecurringDecision(shape, "2026-08", "acme streaming", "confirmed")
    shape = completeRecurringStep(shape, "2026-08", false)
    expect(getMonthRecord(shape, "2026-08").step).toBe(3)

    shape = closeMonth(shape, "2026-08", "2026-09-02T00:00:00.000Z")
    expect(isMonthClosed(shape, "2026-08")).toBe(true)
    expect(getMonthRecord(shape, "2026-08").closedAt).toBe("2026-09-02T00:00:00.000Z")
  })

  it("supports skip paths on every step and skipping the whole month", () => {
    let shape = emptyShape()
    shape = startClose(shape, "2026-08")
    shape = completeTriageStep(shape, "2026-08", true)
    expect(getMonthRecord(shape, "2026-08").triageSkipped).toBe(true)

    shape = completeRecurringStep(shape, "2026-08", true)
    expect(getMonthRecord(shape, "2026-08").recurringSkipped).toBe(true)
    expect(getMonthRecord(shape, "2026-08").step).toBe(3)

    shape = skipCloseMonth(emptyShape(), "2026-08")
    expect(isMonthSkipped(shape, "2026-08")).toBe(true)
    shape = unskipCloseMonth(shape, "2026-08")
    expect(isMonthSkipped(shape, "2026-08")).toBe(false)
  })

  it("resumes mid-flow from persisted storage", () => {
    const storage = memoryStorage()
    let shape = startClose(emptyShape(), "2026-08")
    shape = completeTriageStep(shape, "2026-08", false)
    writeMonthlyCloseStore(storage, shape)

    const reloaded = readMonthlyCloseStore(storage)
    expect(getMonthRecord(reloaded, "2026-08").step).toBe(2)
    expect(getMonthRecord(reloaded, "2026-08").started).toBe(true)
  })

  it("resets on month rollover while keeping prior months", () => {
    let shape = closeMonth(emptyShape(), "2026-08", "2026-09-01T00:00:00.000Z")
    expect(isMonthClosed(shape, "2026-08")).toBe(true)
    expect(getMonthRecord(shape, "2026-09").started).toBe(false)
    expect(isMonthClosed(shape, "2026-09")).toBe(false)
    expect(isMonthClosed(shape, "2026-08")).toBe(true)
  })

  it("already-clean month fast-path still closes cleanly", () => {
    let shape = startClose(emptyShape(), "2026-08")
    shape = completeTriageStep(shape, "2026-08", false)
    shape = completeRecurringStep(shape, "2026-08", false)
    shape = closeMonth(shape, "2026-08")
    expect(isMonthClosed(shape, "2026-08")).toBe(true)
  })

  it("dismisses the banner without closing, and reopens after close", () => {
    let shape = emptyShape()
    expect(shouldShowCloseBanner(shape, "2026-08", true)).toBe(true)
    expect(shouldShowCloseBanner(shape, "2026-08", false)).toBe(false)

    shape = dismissCloseBanner(shape, "2026-08")
    expect(shouldShowCloseBanner(shape, "2026-08", true)).toBe(false)

    shape = closeMonth(shape, "2026-08")
    shape = reopenMonth(shape, "2026-08")
    expect(isMonthClosed(shape, "2026-08")).toBe(false)
  })

  it("tracks recurring confirm and flag-missing decisions with undo", () => {
    let shape = startClose(emptyShape(), "2026-08")
    shape = setRecurringDecision(shape, "2026-08", "acme", "missing")
    expect(getMonthRecord(shape, "2026-08").confirmed["acme"]).toBe("missing")
    shape = clearRecurringDecision(shape, "2026-08", "acme")
    expect(getMonthRecord(shape, "2026-08").confirmed["acme"]).toBeUndefined()
  })

  it("moves backward a step without losing decisions", () => {
    let shape = startClose(emptyShape(), "2026-08")
    shape = setRecurringDecision(shape, "2026-08", "acme", "confirmed")
    shape = setCloseStep(shape, "2026-08", 1)
    expect(getMonthRecord(shape, "2026-08").step).toBe(1)
    expect(getMonthRecord(shape, "2026-08").confirmed["acme"]).toBe("confirmed")
  })

  it("ignores versioned, corrupt, and foreign-month payloads", () => {
    const storage = memoryStorage()
    storage.setItem(MONTHLY_CLOSE_STORAGE_KEY, JSON.stringify({ version: 999, months: {} }))
    expect(readMonthlyCloseStore(storage)).toEqual(emptyShape())

    storage.setItem(MONTHLY_CLOSE_STORAGE_KEY, "{not-json")
    expect(readMonthlyCloseStore(storage)).toEqual(emptyShape())

    storage.setItem(
      MONTHLY_CLOSE_STORAGE_KEY,
      JSON.stringify({ version: 1, months: { "not-a-month": { step: 1 } } }),
    )
    expect(readMonthlyCloseStore(storage)).toEqual(emptyShape())
  })
})
