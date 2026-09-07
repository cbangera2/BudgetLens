import {
  loadTransactionFormDefaults,
  saveTransactionFormDefaults,
  TRANSACTION_FORM_DEFAULTS_KEY,
  TRANSACTION_FORM_DEFAULTS_VERSION,
} from "./transaction-form-defaults"

const DEFAULTS = {
  accountName: "Sample Checking",
  accountType: "Checking",
  category: "Groceries",
  transactionType: "Debit",
}

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

describe("transaction form defaults store", () => {
  it("returns null when nothing was stored", () => {
    expect(loadTransactionFormDefaults(memoryStorage())).toBeNull()
  })

  it("round-trips saved defaults with a versioned key", () => {
    const storage = memoryStorage()
    saveTransactionFormDefaults(DEFAULTS, storage)
    expect(loadTransactionFormDefaults(storage)).toEqual(DEFAULTS)
    const raw = storage.getItem(TRANSACTION_FORM_DEFAULTS_KEY)
    expect(raw).toContain(`"version":${TRANSACTION_FORM_DEFAULTS_VERSION}`)
  })

  it("resets on version mismatch", () => {
    const storage = memoryStorage({
      [TRANSACTION_FORM_DEFAULTS_KEY]: JSON.stringify({ version: 999, ...DEFAULTS }),
    })
    expect(loadTransactionFormDefaults(storage)).toBeNull()
  })

  it("falls back to null on corrupt JSON", () => {
    const storage = memoryStorage({ [TRANSACTION_FORM_DEFAULTS_KEY]: "{not json" })
    expect(loadTransactionFormDefaults(storage)).toBeNull()
  })

  it("falls back to null on non-object payloads", () => {
    for (const raw of ['"just a string"', "42", "null", "[1,2]"]) {
      const storage = memoryStorage({ [TRANSACTION_FORM_DEFAULTS_KEY]: raw })
      expect(loadTransactionFormDefaults(storage)).toBeNull()
    }
  })

  it("sanitizes non-string fields to blank defaults", () => {
    const storage = memoryStorage({
      [TRANSACTION_FORM_DEFAULTS_KEY]: JSON.stringify({
        version: TRANSACTION_FORM_DEFAULTS_VERSION,
        accountName: 42,
        accountType: null,
        category: "Groceries",
      }),
    })
    expect(loadTransactionFormDefaults(storage)).toEqual({
      accountName: "",
      accountType: "",
      category: "Groceries",
      transactionType: "",
    })
  })

  it("never throws when storage is unavailable", () => {
    const failingGet = {
      getItem: () => {
        throw new Error("blocked")
      },
    }
    expect(loadTransactionFormDefaults(failingGet)).toBeNull()
    const failingSet = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(() => saveTransactionFormDefaults(DEFAULTS, failingSet)).not.toThrow()
  })

  it("survives a throwing global localStorage getter", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked")
      },
    })
    try {
      expect(loadTransactionFormDefaults()).toBeNull()
      expect(() => saveTransactionFormDefaults(DEFAULTS)).not.toThrow()
    } finally {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor)
    }
  })
})
