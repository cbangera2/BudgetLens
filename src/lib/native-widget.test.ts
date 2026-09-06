import { describe, expect, it, vi } from "vitest"

import {
  WIDGET_SNAPSHOT_FILENAME,
  WIDGET_SNAPSHOT_STORAGE_KEY,
  readStagedWidgetSnapshot,
  writeWidgetSnapshot,
} from "@/lib/native"

describe("widget snapshot sink on web (no bridge)", () => {
  it("exposes the stable bridge constants", () => {
    expect(WIDGET_SNAPSHOT_FILENAME).toBe("budgetlens-widget-snapshot.json")
    expect(WIDGET_SNAPSHOT_STORAGE_KEY).toBe("budgetlens.widget-snapshot")
  })

  it("round-trips a payload through the localStorage scratch location", async () => {
    expect(await readStagedWidgetSnapshot()).toBeNull()

    const payload = JSON.stringify({ version: 1, generatedAt: "2026-09-06T12:00:00.000Z" })
    await expect(writeWidgetSnapshot(payload)).resolves.toEqual({ ok: true, via: "local-storage" })

    expect(window.localStorage.getItem(WIDGET_SNAPSHOT_STORAGE_KEY)).toBe(payload)
    await expect(readStagedWidgetSnapshot()).resolves.toBe(payload)
  })

  it("rejects empty payloads without writing", async () => {
    await expect(writeWidgetSnapshot("")).resolves.toEqual({
      ok: false,
      via: "noop",
      reason: "empty-payload",
    })
    expect(window.localStorage.getItem(WIDGET_SNAPSHOT_STORAGE_KEY)).toBeNull()
  })

  it("degrades to a noop result when web storage throws", async () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("synthetic quota exceeded")
    })
    try {
      await expect(writeWidgetSnapshot('{"version":1}')).resolves.toEqual({
        ok: false,
        via: "noop",
        reason: "web-storage-unavailable",
      })
    } finally {
      setItemSpy.mockRestore()
    }
  })

  it("reads null when the scratch location throws", async () => {
    const getItemSpy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("synthetic storage failure")
    })
    try {
      await expect(readStagedWidgetSnapshot()).resolves.toBeNull()
    } finally {
      getItemSpy.mockRestore()
    }
  })
})
