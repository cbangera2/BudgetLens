import {
  BUDGET_FORM_DEFAULTS_KEY,
  BUDGET_FORM_DEFAULTS_VERSION,
  loadBudgetFormDefaults,
  saveBudgetFormDefaults,
} from "./budget-form-defaults"

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

describe("budget form defaults store", () => {
  it("returns null when nothing was stored", () => {
    expect(loadBudgetFormDefaults(memoryStorage())).toBeNull()
  })

  it("round-trips the last-used period with a versioned key", () => {
    const storage = memoryStorage()
    saveBudgetFormDefaults("yearly", storage)
    expect(loadBudgetFormDefaults(storage)).toBe("yearly")
    const raw = storage.getItem(BUDGET_FORM_DEFAULTS_KEY)
    expect(raw).toContain(`"version":${BUDGET_FORM_DEFAULTS_VERSION}`)
    saveBudgetFormDefaults("monthly", storage)
    expect(loadBudgetFormDefaults(storage)).toBe("monthly")
  })

  it("resets on version mismatch", () => {
    const storage = memoryStorage({
      [BUDGET_FORM_DEFAULTS_KEY]: JSON.stringify({ version: 999, period: "yearly" }),
    })
    expect(loadBudgetFormDefaults(storage)).toBeNull()
  })

  it("falls back to null on corrupt JSON", () => {
    const storage = memoryStorage({ [BUDGET_FORM_DEFAULTS_KEY]: "{not json" })
    expect(loadBudgetFormDefaults(storage)).toBeNull()
  })

  it("falls back to null on invalid periods", () => {
    for (const period of ["weekly", "", 42, null]) {
      const storage = memoryStorage({
        [BUDGET_FORM_DEFAULTS_KEY]: JSON.stringify({
          version: BUDGET_FORM_DEFAULTS_VERSION,
          period,
        }),
      })
      expect(loadBudgetFormDefaults(storage)).toBeNull()
    }
  })

  it("never throws when storage is unavailable", () => {
    const failingGet = {
      getItem: () => {
        throw new Error("blocked")
      },
    }
    expect(loadBudgetFormDefaults(failingGet)).toBeNull()
    const failingSet = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(() => saveBudgetFormDefaults("yearly", failingSet)).not.toThrow()
  })
})
