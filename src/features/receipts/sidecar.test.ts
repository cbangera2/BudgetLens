import {
  addReceiptRef,
  clearReceiptRefs,
  findTransactionsReferencingHash,
  listReceiptRefs,
  RECEIPT_SIDECAR_KEY,
  readReceiptSidecar,
  removeReceiptRef,
  type ReceiptRef,
} from "@/features/receipts/sidecar"

function buildRef(hash: string): ReceiptRef {
  return {
    hash,
    mimeType: "image/jpeg",
    sizeBytes: 1234,
    width: 1024,
    height: 768,
    createdAt: "2026-08-15T12:00:00.000Z",
  }
}

describe("receipt sidecar map", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("starts empty and round-trips references per transaction", () => {
    expect(listReceiptRefs("tx-1")).toEqual([])

    addReceiptRef("tx-1", buildRef("hash-a"))
    addReceiptRef("tx-1", buildRef("hash-b"))
    addReceiptRef("tx-2", buildRef("hash-a"))

    expect(listReceiptRefs("tx-1").map((ref) => ref.hash)).toEqual(["hash-a", "hash-b"])
    expect(listReceiptRefs("tx-2").map((ref) => ref.hash)).toEqual(["hash-a"])
  })

  it("dedupes identical hashes within one transaction", () => {
    addReceiptRef("tx-1", buildRef("hash-a"))
    addReceiptRef("tx-1", buildRef("hash-a"))
    expect(listReceiptRefs("tx-1")).toHaveLength(1)
  })

  it("removes single refs and clears whole transactions", () => {
    addReceiptRef("tx-1", buildRef("hash-a"))
    addReceiptRef("tx-1", buildRef("hash-b"))

    expect(removeReceiptRef("tx-1", "hash-a")?.hash).toBe("hash-a")
    expect(removeReceiptRef("tx-1", "missing")).toBeNull()
    expect(listReceiptRefs("tx-1").map((ref) => ref.hash)).toEqual(["hash-b"])

    expect(clearReceiptRefs("tx-1").map((ref) => ref.hash)).toEqual(["hash-b"])
    expect(listReceiptRefs("tx-1")).toEqual([])
    expect(window.localStorage.getItem(RECEIPT_SIDECAR_KEY)).toBe("{}")
    expect(clearReceiptRefs("tx-1")).toEqual([])
  })

  it("finds remaining references for garbage collection", () => {
    addReceiptRef("tx-1", buildRef("hash-a"))
    addReceiptRef("tx-2", buildRef("hash-a"))

    expect(findTransactionsReferencingHash("hash-a").toSorted()).toEqual(["tx-1", "tx-2"])
    removeReceiptRef("tx-1", "hash-a")
    expect(findTransactionsReferencingHash("hash-a")).toEqual(["tx-2"])
    expect(findTransactionsReferencingHash("missing")).toEqual([])
  })

  it("tolerates corrupt or foreign sidecar payloads", () => {
    window.localStorage.setItem(RECEIPT_SIDECAR_KEY, "not-json{{")
    expect(readReceiptSidecar()).toEqual({})
    expect(listReceiptRefs("tx-1")).toEqual([])

    window.localStorage.setItem(
      RECEIPT_SIDECAR_KEY,
      JSON.stringify({ "tx-1": [{ nope: true }], "tx-2": "junk" }),
    )
    expect(listReceiptRefs("tx-1")).toEqual([])

    addReceiptRef("tx-1", buildRef("hash-a"))
    expect(listReceiptRefs("tx-1")).toHaveLength(1)
  })
})
