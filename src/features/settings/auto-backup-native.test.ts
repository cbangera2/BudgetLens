import { Directory, Encoding } from "@capacitor/filesystem"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_BACKUP_FILENAME,
  AUTO_BACKUP_LAST_KEY,
  readAutoBackupLastTimestamp,
  writeAutoBackupFile,
  writeAutoBackupLastTimestamp,
} from "@/lib/native"

const mocks = vi.hoisted(() => ({
  prefsGet: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  prefsSet: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  writeFile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: mocks.prefsGet,
    set: mocks.prefsSet,
    remove: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  },
}))

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Documents: "DOCUMENTS" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    writeFile: mocks.writeFile,
  },
}))

declare global {
  interface Window {
    webkit?: { messageHandlers?: { bridge?: unknown } } | undefined
  }
}

function simulateNativeBridge(): void {
  window.webkit = { messageHandlers: { bridge: {} } }
}

afterEach(() => {
  window.webkit = undefined
  vi.clearAllMocks()
})

describe("auto-backup native persistence", () => {
  it("leaves every plugin untouched on web", async () => {
    await expect(readAutoBackupLastTimestamp()).resolves.toBeNull()
    await expect(writeAutoBackupFile('{"hello":"web"}')).resolves.toBeUndefined()
    await expect(writeAutoBackupLastTimestamp(1_786_000_000_000)).resolves.toBeUndefined()
    expect(mocks.prefsGet).not.toHaveBeenCalled()
    expect(mocks.prefsSet).not.toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it("overwrites the single Documents file on native", async () => {
    simulateNativeBridge()
    mocks.writeFile.mockResolvedValueOnce({
      uri: "file:///Documents/budgetlens-auto-backup.json",
    })
    await writeAutoBackupFile('{"version":3}')
    expect(mocks.writeFile).toHaveBeenCalledTimes(1)
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: AUTO_BACKUP_FILENAME,
      data: '{"version":3}',
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
  })

  it("propagates native file-write failures so the timestamp is skipped", async () => {
    simulateNativeBridge()
    mocks.writeFile.mockRejectedValueOnce(new Error("disk full"))
    await expect(writeAutoBackupFile('{"version":3}')).rejects.toThrow("disk full")
  })

  it("round-trips the last-run timestamp through Preferences on native", async () => {
    simulateNativeBridge()
    mocks.prefsGet.mockResolvedValueOnce({ value: "1786000000000" })
    await expect(readAutoBackupLastTimestamp()).resolves.toBe(1_786_000_000_000)
    await writeAutoBackupLastTimestamp(1_786_000_000_000)
    expect(mocks.prefsSet).toHaveBeenCalledWith({
      key: AUTO_BACKUP_LAST_KEY,
      value: "1786000000000",
    })
  })

  it("propagates native timestamp-write failures instead of reporting success", async () => {
    simulateNativeBridge()
    mocks.prefsSet.mockRejectedValueOnce(new Error("prefs locked"))
    await expect(writeAutoBackupLastTimestamp(1_786_000_000_000)).rejects.toThrow("prefs locked")
  })

  it("reads corrupt timestamps as null on native", async () => {
    simulateNativeBridge()
    mocks.prefsGet.mockResolvedValueOnce({ value: "not-a-number" })
    await expect(readAutoBackupLastTimestamp()).resolves.toBeNull()
  })
})
