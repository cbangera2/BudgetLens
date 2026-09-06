// Content hashing for receipt photos.
//
// The sidecar map (sidecar.ts) keys image bytes by their SHA-256 hex digest,
// so identical captures attached to several transactions share one stored
// thumbnail and deleting the last reference can garbage-collect the bytes.

const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

/**
 * Pure-JavaScript SHA-256 hex digest. Used when SubtleCrypto is unavailable
 * (non-secure contexts, some test runtimes) so hashing stays deterministic
 * everywhere the app runs.
 */
export function sha256HexPureJs(data: Uint8Array): string {
  const bitLength = data.length * 8
  const paddedLength = (((data.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(data)
  padded[data.length] = 0x80
  const highBits = Math.floor(bitLength / 0x1_00_00_00_00)
  const lowBits = bitLength >>> 0
  padded[paddedLength - 8] = (highBits >>> 24) & 0xff
  padded[paddedLength - 7] = (highBits >>> 16) & 0xff
  padded[paddedLength - 6] = (highBits >>> 8) & 0xff
  padded[paddedLength - 5] = highBits & 0xff
  padded[paddedLength - 4] = (lowBits >>> 24) & 0xff
  padded[paddedLength - 3] = (lowBits >>> 16) & 0xff
  padded[paddedLength - 2] = (lowBits >>> 8) & 0xff
  padded[paddedLength - 1] = lowBits & 0xff

  const state = [...SHA256_INITIAL_STATE]
  const schedule: number[] = Array.from({ length: 64 }, () => 0)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] =
        ((padded[offset + index * 4] ?? 0) << 24) |
        ((padded[offset + index * 4 + 1] ?? 0) << 16) |
        ((padded[offset + index * 4 + 2] ?? 0) << 8) |
        (padded[offset + index * 4 + 3] ?? 0)
    }
    for (let index = 16; index < 64; index += 1) {
      const wordA = schedule[index - 15] ?? 0
      const wordB = schedule[index - 2] ?? 0
      const sigma0 = rotateRight(wordA, 7) ^ rotateRight(wordA, 18) ^ (wordA >>> 3)
      const sigma1 = rotateRight(wordB, 17) ^ rotateRight(wordB, 19) ^ (wordB >>> 10)
      schedule[index] =
        ((schedule[index - 16] ?? 0) + sigma0 + (schedule[index - 7] ?? 0) + sigma1) | 0
    }

    let a = state[0] ?? 0
    let b = state[1] ?? 0
    let c = state[2] ?? 0
    let d = state[3] ?? 0
    let e = state[4] ?? 0
    let f = state[5] ?? 0
    let g = state[6] ?? 0
    let h = state[7] ?? 0
    for (let index = 0; index < 64; index += 1) {
      const word = schedule[index] ?? 0
      const bigSigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + bigSigma1 + choice + (SHA256_ROUND_CONSTANTS[index] ?? 0) + word) | 0
      const bigSigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (bigSigma0 + majority) | 0
      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }
    state[0] = ((state[0] ?? 0) + a) | 0
    state[1] = ((state[1] ?? 0) + b) | 0
    state[2] = ((state[2] ?? 0) + c) | 0
    state[3] = ((state[3] ?? 0) + d) | 0
    state[4] = ((state[4] ?? 0) + e) | 0
    state[5] = ((state[5] ?? 0) + f) | 0
    state[6] = ((state[6] ?? 0) + g) | 0
    state[7] = ((state[7] ?? 0) + h) | 0
  }

  return state.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("")
}

/**
 * SHA-256 hex digest of raw bytes. Prefers SubtleCrypto and falls back to the
 * pure-JS implementation above, so the same bytes always hash the same way.
 */
export async function sha256HexBytes(data: Uint8Array): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (subtle) {
      const copy = new Uint8Array(data.byteLength)
      copy.set(data)
      const digest = await subtle.digest("SHA-256", copy.buffer)
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
    }
  } catch {
    // A missing or blocked SubtleCrypto falls through to the pure-JS digest.
  }
  return sha256HexPureJs(data)
}

/** SHA-256 hex digest of a Blob's bytes (for example a downscaled thumbnail). */
export async function sha256HexBlob(blob: Blob): Promise<string> {
  return sha256HexBytes(new Uint8Array(await blob.arrayBuffer()))
}
