import { afterEach, describe, expect, it } from "vitest"

import { isTauriAsync, isTauriSync } from "@/lib/isTauri"

afterEach(() => {
  // oxlint-disable-next-line no-underscore-dangle -- Tauri 2 runtime global.
  delete window.__TAURI_INTERNALS__
})

describe("isTauri runtime detection", () => {
  it("reports false on plain web (no Tauri globals)", () => {
    expect(isTauriSync()).toBe(false)
  })

  it("reports true when the Tauri internals global is present", () => {
    // oxlint-disable-next-line no-underscore-dangle -- Tauri 2 runtime global.
    window.__TAURI_INTERNALS__ = {}
    expect(isTauriSync()).toBe(true)
  })

  it("async check resolves false on plain web", async () => {
    await expect(isTauriAsync()).resolves.toBe(false)
  })
})
