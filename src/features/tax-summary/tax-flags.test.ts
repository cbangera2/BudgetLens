import { readTaxFlags, TAX_FLAGS_STORAGE_KEY, writeTaxFlags, type TaxFlags } from "./tax-flags"

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
  } satisfies Storage
}

describe("tax flags store", () => {
  it("round-trips deductible, taxable, charitable, and none flags by category", () => {
    const storage = memoryStorage()
    const flags: TaxFlags = {
      "Office Supplies": "deductible",
      Income: "taxable",
      "Charitable Donations": "charitable",
      Dining: "none",
    }

    writeTaxFlags(flags, storage)

    expect(readTaxFlags(storage)).toEqual(flags)
    expect(storage.getItem(TAX_FLAGS_STORAGE_KEY)).toBe(JSON.stringify({ version: 1, flags }))
  })

  it("returns empty flags for missing, corrupt, or unversioned content", () => {
    const storage = memoryStorage()
    expect(readTaxFlags(storage)).toEqual({})

    storage.setItem(TAX_FLAGS_STORAGE_KEY, "not json")
    expect(readTaxFlags(storage)).toEqual({})

    storage.setItem(TAX_FLAGS_STORAGE_KEY, JSON.stringify({ version: 99, flags: {} }))
    expect(readTaxFlags(storage)).toEqual({})

    storage.setItem(TAX_FLAGS_STORAGE_KEY, JSON.stringify({ Income: "bogus" }))
    expect(readTaxFlags(storage)).toEqual({})

    storage.setItem(TAX_FLAGS_STORAGE_KEY, JSON.stringify(["taxable"]))
    expect(readTaxFlags(storage)).toEqual({})
  })

  it("loads the legacy bare-record shape written before the versioned envelope", () => {
    const storage = memoryStorage()
    storage.setItem(TAX_FLAGS_STORAGE_KEY, JSON.stringify({ Income: "taxable" }))

    expect(readTaxFlags(storage)).toEqual({ Income: "taxable" })
  })

  it("clears the storage key when no flags remain", () => {
    const storage = memoryStorage()
    writeTaxFlags({ Income: "taxable" }, storage)
    expect(storage.getItem(TAX_FLAGS_STORAGE_KEY)).not.toBeNull()

    writeTaxFlags({}, storage)
    expect(storage.getItem(TAX_FLAGS_STORAGE_KEY)).toBeNull()
    expect(readTaxFlags(storage)).toEqual({})
  })
})
