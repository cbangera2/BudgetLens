// Deterministic regression test for the per-hash serialization in receipts.ts.
//
// A concurrent attach of identical bytes must not land its sidecar reference
// between another task's reference check and blob deletion. The in-memory
// store below stands in for the real backends; gating blob deletion forces
// the exact interleave that strands a reference without serialization.

import {
  addReceiptForTransaction,
  listTransactionReceipts,
  removeTransactionReceipt,
} from "@/features/receipts/receipts"
import { loadReceiptBlob } from "@/features/receipts/storage"
import { syntheticImageFile } from "@/features/receipts/synthetic-image"

const blobStore = new Map<string, Blob>()
const saveCalls: string[] = []
const deleteCalls: string[] = []
let deleteGate: Promise<void> = Promise.resolve()

vi.mock("@/features/receipts/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/receipts/storage")>()
  return {
    ...actual,
    saveReceiptBlob: async (hash: string, blob: Blob): Promise<void> => {
      saveCalls.push(hash)
      blobStore.set(hash, blob)
    },
    loadReceiptBlob: async (hash: string): Promise<Blob | null> => blobStore.get(hash) ?? null,
    deleteReceiptBlob: async (hash: string): Promise<void> => {
      deleteCalls.push(hash)
      await deleteGate
      blobStore.delete(hash)
    },
  }
})

describe("receipt hash serialization", () => {
  beforeEach(() => {
    window.localStorage.clear()
    blobStore.clear()
    saveCalls.length = 0
    deleteCalls.length = 0
    deleteGate = Promise.resolve()
  })

  it("keeps references and bytes consistent when attach races removal", async () => {
    await addReceiptForTransaction("tx-race-1", syntheticImageFile("race-a"))
    const hash = listTransactionReceipts("tx-race-1")[0]?.hash
    if (!hash) throw new Error("expected a seeded receipt reference")

    // Freeze blob deletion mid-flight, then attach the identical bytes
    // elsewhere while the delete is still pending.
    let releaseDelete: (() => void) | undefined
    deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve
    })
    const removal = removeTransactionReceipt("tx-race-1", hash)
    await vi.waitFor(() => {
      expect(deleteCalls).toContain(hash)
    })
    let attachmentSettled = false
    const attachment = addReceiptForTransaction("tx-race-2", syntheticImageFile("race-a")).then(
      (ref) => {
        attachmentSettled = true
        return ref
      },
    )
    // Let every pending microtask and timer drain: the attach must stay
    // queued behind the in-flight delete section rather than racing it.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(attachmentSettled).toBe(false)

    releaseDelete?.()
    expect(await removal).toBe(true)
    await attachment

    // Either order is valid, but the end state must agree: the surviving
    // reference points at stored bytes.
    expect(listTransactionReceipts("tx-race-1")).toHaveLength(0)
    expect(listTransactionReceipts("tx-race-2").map((ref) => ref.hash)).toEqual([hash])
    await expect(loadReceiptBlob(hash)).resolves.not.toBeNull()
  })
})
