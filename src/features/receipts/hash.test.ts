import { sha256HexBlob, sha256HexBytes, sha256HexPureJs } from "@/features/receipts/hash"

describe("receipt content hashing", () => {
  it("matches the SHA-256 test vector for 'abc'", () => {
    expect(sha256HexPureJs(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })

  it("is stable for identical bytes and sensitive to any change", async () => {
    const first = await sha256HexBytes(new TextEncoder().encode("receipt-bytes"))
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(await sha256HexBytes(new TextEncoder().encode("receipt-bytes"))).toBe(first)
    expect(await sha256HexBytes(new TextEncoder().encode("receipt-bytes!"))).not.toBe(first)
  })

  it("agrees across the SubtleCrypto and pure-JS implementations", async () => {
    // Multi-block input exercises the padding path in both implementations.
    const bytes = new Uint8Array(300).map((_, index) => index % 251)
    await expect(sha256HexBytes(bytes)).resolves.toBe(sha256HexPureJs(bytes))
  })

  it("hashes blob bytes identically to the same raw bytes", async () => {
    const bytes = new TextEncoder().encode("thumbnail-bytes")
    await expect(sha256HexBlob(new Blob([bytes], { type: "image/jpeg" }))).resolves.toBe(
      await sha256HexBytes(bytes),
    )
  })
})
