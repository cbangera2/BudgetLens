// Synthetic in-code image fixtures for receipt tests (never real photos).
//
// A 1x1 transparent PNG plus an optional seed suffix, so tests can generate
// distinct images with distinct content hashes.

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** Raw bytes of the synthetic PNG, suffixed with seed bytes when given. */
export function syntheticPngBytes(seed = ""): Uint8Array<ArrayBuffer> {
  const binary = atob(TINY_PNG_BASE64)
  const seedBytes = new TextEncoder().encode(seed)
  const bytes = new Uint8Array(binary.length + seedBytes.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  bytes.set(seedBytes, binary.length)
  return bytes
}

/** A synthetic PNG File for file-input and attach-pipeline tests. */
export function syntheticImageFile(seed = "", name = "receipt.png"): File {
  const bytes = syntheticPngBytes(seed)
  return new File([bytes.buffer], name, { type: "image/png" })
}
