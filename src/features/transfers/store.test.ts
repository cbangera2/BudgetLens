import {
  confirmedTransferIds,
  dismissedTransferIds,
  isConfirmedTransfer,
  readTransferFlags,
  TRANSFER_FLAGS_STORAGE_KEY,
  writeTransferFlags,
} from "./store"

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

describe("transfer flags store", () => {
  it("round-trips confirmed and dismissed flags keyed by transaction id", () => {
    const storage = memoryStorage()
    writeTransferFlags({ out: "confirmed", in: "confirmed", other: "dismissed" }, storage)
    const flags = readTransferFlags(storage)
    expect(flags).toEqual({ out: "confirmed", in: "confirmed", other: "dismissed" })
    expect(confirmedTransferIds(flags)).toEqual(new Set(["out", "in"]))
    expect(dismissedTransferIds(flags)).toEqual(new Set(["other"]))
    expect(isConfirmedTransfer("out", flags)).toBe(true)
    expect(isConfirmedTransfer("other", flags)).toBe(false)
  })

  it("returns empty flags for missing or corrupt payloads", () => {
    const storage = memoryStorage()
    expect(readTransferFlags(storage)).toEqual({})
    storage.setItem(TRANSFER_FLAGS_STORAGE_KEY, "not json")
    expect(readTransferFlags(storage)).toEqual({})
    storage.setItem(TRANSFER_FLAGS_STORAGE_KEY, JSON.stringify({ out: "bogus" }))
    expect(readTransferFlags(storage)).toEqual({})
  })

  it("clears the storage key when no flags remain", () => {
    const storage = memoryStorage()
    writeTransferFlags({ out: "confirmed" }, storage)
    expect(storage.getItem(TRANSFER_FLAGS_STORAGE_KEY)).not.toBeNull()
    writeTransferFlags({}, storage)
    expect(storage.getItem(TRANSFER_FLAGS_STORAGE_KEY)).toBeNull()
  })
})
