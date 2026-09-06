import { deleteReceiptBlob, loadReceiptBlob, saveReceiptBlob } from "@/features/receipts/storage"

describe("receipt blob storage (IndexedDB fallback)", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("round-trips bytes under their hash", async () => {
    const bytes = new TextEncoder().encode("thumbnail-bytes")
    await saveReceiptBlob("roundtrip-hash", new Blob([bytes], { type: "image/jpeg" }))

    const loaded = await loadReceiptBlob("roundtrip-hash")
    if (!loaded) throw new Error("expected stored receipt bytes")
    expect(loaded.type).toBe("image/jpeg")
    // Spread to plain arrays: IndexedDB clones buffers across realms, where
    // typed-array deep equality is unreliable.
    expect([...new Uint8Array(await loaded.arrayBuffer())]).toEqual([...bytes])
  })

  it("returns null for missing hashes and overwrites on resave", async () => {
    await expect(loadReceiptBlob("missing-overwrite-hash")).resolves.toBeNull()

    await saveReceiptBlob("overwrite-hash", new Blob(["first"], { type: "image/jpeg" }))
    await saveReceiptBlob("overwrite-hash", new Blob(["second"], { type: "image/jpeg" }))

    const loaded = await loadReceiptBlob("overwrite-hash")
    if (!loaded) throw new Error("expected stored receipt bytes")
    expect(await loaded.text()).toBe("second")
  })

  it("deletes bytes so loads miss afterwards", async () => {
    await saveReceiptBlob("delete-hash", new Blob(["bytes"], { type: "image/jpeg" }))

    await deleteReceiptBlob("delete-hash")

    await expect(loadReceiptBlob("delete-hash")).resolves.toBeNull()
    await expect(deleteReceiptBlob("missing-delete-hash")).resolves.toBeUndefined()
  })
})

describe("receipt blob storage (OPFS)", () => {
  it("prefers OPFS when available", async () => {
    const files = new Map<string, Blob>()
    const subdirectory = {
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        if (!files.has(name) && !options?.create) {
          throw new DOMException("File not found.", "NotFoundError")
        }
        return {
          createWritable: async () => ({
            write: async (blob: Blob) => {
              files.set(name, blob)
            },
            close: async () => undefined,
          }),
          getFile: async () => {
            const stored = files.get(name)
            if (!stored) throw new DOMException("File not found.", "NotFoundError")
            return stored
          },
        }
      },
      removeEntry: async (name: string) => {
        files.delete(name)
      },
    }
    const root = { getDirectoryHandle: async () => subdirectory }
    Object.defineProperty(window.navigator, "storage", {
      configurable: true,
      value: { getDirectory: async () => root },
    })
    try {
      const bytes = new TextEncoder().encode("opfs-bytes")
      await saveReceiptBlob("opfs-hash", new Blob([bytes], { type: "image/jpeg" }))
      expect(files.has("opfs-hash.jpg")).toBe(true)

      const loaded = await loadReceiptBlob("opfs-hash")
      if (!loaded) throw new Error("expected stored receipt bytes")
      expect(await loaded.text()).toBe("opfs-bytes")

      await deleteReceiptBlob("opfs-hash")
      expect(files.has("opfs-hash.jpg")).toBe(false)
      await expect(loadReceiptBlob("opfs-hash")).resolves.toBeNull()
    } finally {
      // jsdom ships no navigator.storage; drop the test double afterwards.
      Reflect.deleteProperty(window.navigator, "storage")
    }
  })
})
