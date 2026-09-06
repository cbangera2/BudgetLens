import { act, renderHook } from "@testing-library/react"

import {
  confirmedTransferIds,
  dismissedTransferIds,
  isConfirmedTransfer,
  readTransferFlags,
  TRANSFER_FLAGS_STORAGE_KEY,
  useTransferFlags,
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

  it("returns empty flags for missing, corrupt, or array payloads", () => {
    const storage = memoryStorage()
    expect(readTransferFlags(storage)).toEqual({})
    storage.setItem(TRANSFER_FLAGS_STORAGE_KEY, "not json")
    expect(readTransferFlags(storage)).toEqual({})
    storage.setItem(TRANSFER_FLAGS_STORAGE_KEY, JSON.stringify({ out: "bogus" }))
    expect(readTransferFlags(storage)).toEqual({})
    storage.setItem(TRANSFER_FLAGS_STORAGE_KEY, JSON.stringify(["confirmed"]))
    expect(readTransferFlags(storage)).toEqual({})
    expect(isConfirmedTransfer("0", readTransferFlags(storage))).toBe(false)
  })

  it("clears the storage key when no flags remain", () => {
    const storage = memoryStorage()
    writeTransferFlags({ out: "confirmed" }, storage)
    expect(storage.getItem(TRANSFER_FLAGS_STORAGE_KEY)).not.toBeNull()
    writeTransferFlags({}, storage)
    expect(storage.getItem(TRANSFER_FLAGS_STORAGE_KEY)).toBeNull()
  })

  it("merges flags persisted by another tab instead of overwriting them", () => {
    const { result } = renderHook(() => useTransferFlags())
    window.localStorage.setItem(
      TRANSFER_FLAGS_STORAGE_KEY,
      JSON.stringify({ "other-tab": "confirmed" }),
    )
    act(() => {
      result.current.confirmPair("out", "in")
    })
    expect(readTransferFlags()).toEqual({
      "other-tab": "confirmed",
      out: "confirmed",
      in: "confirmed",
    })
  })

  it("preserves another tab's confirmation when clearing a different id", () => {
    window.localStorage.setItem(TRANSFER_FLAGS_STORAGE_KEY, JSON.stringify({ keep: "confirmed" }))
    const { result } = renderHook(() => useTransferFlags())
    window.localStorage.setItem(
      TRANSFER_FLAGS_STORAGE_KEY,
      JSON.stringify({ keep: "confirmed", fresh: "confirmed" }),
    )
    act(() => {
      result.current.clearFlag("keep")
    })
    expect(readTransferFlags()).toEqual({ fresh: "confirmed" })
  })
})
