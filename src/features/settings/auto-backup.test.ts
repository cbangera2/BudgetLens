import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_BACKUP_ENABLED_KEY,
  isBackupEmpty,
  maybeRunAutoBackup,
  readAutoBackupEnabled,
  runSuspendAutoBackup,
  setupAutoBackupOnSuspend,
  shouldRunAutoBackup,
  writeAutoBackupEnabled,
} from "@/features/settings/auto-backup"
import {
  AUTO_BACKUP_INTERVAL_MS,
  readAutoBackupLastTimestamp,
  writeAutoBackupFile,
  writeAutoBackupLastTimestamp,
} from "@/lib/native"
import { buildImportBatch, buildTransaction } from "@/test/factories"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1_786_000_000_000

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  } satisfies Storage
}

function nonEmptyBackup() {
  return {
    format: "budgetlens-backup",
    version: 3,
    exportedAt: new Date(NOW).toISOString(),
    transactions: [buildTransaction()],
    wealth: [],
    wealthBreakdown: [],
    wealthAccounts: [],
    budgets: [],
    imports: [buildImportBatch()],
    transactionGroups: [],
  }
}

function emptyBackup() {
  return {
    format: "budgetlens-backup",
    version: 3,
    exportedAt: new Date(NOW).toISOString(),
    transactions: [],
    wealth: [],
    wealthBreakdown: [],
    wealthAccounts: [],
    budgets: [],
    imports: [],
    transactionGroups: [],
  }
}

describe("auto-backup throttle math", () => {
  it("runs when there is no previous backup", () => {
    expect(shouldRunAutoBackup(null, NOW)).toBe(true)
    expect(shouldRunAutoBackup(undefined, NOW)).toBe(true)
  })

  it("skips when the last backup is younger than 24h", () => {
    expect(shouldRunAutoBackup(NOW - (DAY_MS - 1_000), NOW)).toBe(false)
    expect(shouldRunAutoBackup(NOW - 60_000, NOW)).toBe(false)
  })

  it("runs when the last backup is older than 24h", () => {
    expect(shouldRunAutoBackup(NOW - DAY_MS - 1_000, NOW)).toBe(true)
  })

  it("runs exactly at the 24h boundary", () => {
    expect(shouldRunAutoBackup(NOW - DAY_MS, NOW)).toBe(true)
  })

  it("treats invalid or future timestamps safely", () => {
    expect(shouldRunAutoBackup(Number.NaN, NOW)).toBe(true)
    expect(shouldRunAutoBackup(0, NOW)).toBe(true)
    expect(shouldRunAutoBackup(-5, NOW)).toBe(true)
    expect(shouldRunAutoBackup(NOW + 60_000, NOW)).toBe(false)
  })

  it("matches the native interval constant", () => {
    expect(AUTO_BACKUP_INTERVAL_MS).toBe(DAY_MS)
  })
})

describe("auto-backup toggle persist and defaults", () => {
  it("defaults ON for native and OFF for web", () => {
    expect(readAutoBackupEnabled(memoryStorage(), true)).toBe(true)
    expect(readAutoBackupEnabled(memoryStorage(), false)).toBe(false)
    // Web never enables, even with a stored value.
    expect(readAutoBackupEnabled(memoryStorage({ [AUTO_BACKUP_ENABLED_KEY]: "1" }), false)).toBe(
      false,
    )
  })

  it("persists explicit choices", () => {
    const storage = memoryStorage()
    writeAutoBackupEnabled(storage, false)
    expect(readAutoBackupEnabled(storage, true)).toBe(false)
    writeAutoBackupEnabled(storage, true)
    expect(readAutoBackupEnabled(storage, true)).toBe(true)
  })

  it("treats corrupt values as ON for native", () => {
    expect(readAutoBackupEnabled(memoryStorage({ [AUTO_BACKUP_ENABLED_KEY]: "maybe" }), true)).toBe(
      true,
    )
  })

  it("never throws on hostile storage", () => {
    const hostile: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (_key: string): string | null => {
        throw new Error("denied")
      },
      setItem: (_key: string, _value: string): void => {
        throw new Error("denied")
      },
    }
    expect(readAutoBackupEnabled(hostile, true)).toBe(true)
    expect(() => writeAutoBackupEnabled(hostile, true)).not.toThrow()
  })
})

describe("auto-backup empty-database skip", () => {
  it("detects empty backups", () => {
    expect(isBackupEmpty(emptyBackup())).toBe(true)
    expect(isBackupEmpty(null)).toBe(true)
    expect(isBackupEmpty(undefined)).toBe(true)
    expect(isBackupEmpty({})).toBe(true)
  })

  it("detects non-empty backups through any table", () => {
    expect(isBackupEmpty(nonEmptyBackup())).toBe(false)
    expect(isBackupEmpty({ ...emptyBackup(), budgets: [{ id: "b1" }] })).toBe(false)
  })

  it("skips the write and timestamp when the database is empty", async () => {
    const writeFile = vi.fn<(contents: string) => Promise<void>>(async () => undefined)
    const saveTimestamp = vi.fn<(nowMs: number) => Promise<void>>(async () => undefined)
    const status = await maybeRunAutoBackup({
      isNativeShell: true,
      isEnabled: true,
      lastTimestamp: null,
      nowMs: NOW,
      loadBackup: async () => emptyBackup(),
      writeFile,
      saveTimestamp,
    })
    expect(status).toBe("skipped-empty")
    expect(writeFile).not.toHaveBeenCalled()
    expect(saveTimestamp).not.toHaveBeenCalled()
  })
})

describe("auto-backup orchestrator", () => {
  it("skips when the last run is younger than 24h and leaves the timestamp alone", async () => {
    const writeFile = vi.fn<(contents: string) => Promise<void>>(async () => undefined)
    const saveTimestamp = vi.fn<(nowMs: number) => Promise<void>>(async () => undefined)
    const loadBackup = vi.fn<() => Promise<unknown>>(async () => nonEmptyBackup())
    const status = await maybeRunAutoBackup({
      isNativeShell: true,
      isEnabled: true,
      lastTimestamp: NOW - 60_000,
      nowMs: NOW,
      loadBackup,
      writeFile,
      saveTimestamp,
    })
    expect(status).toBe("skipped-throttled")
    expect(loadBackup).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(saveTimestamp).not.toHaveBeenCalled()
  })

  it("writes once and updates the timestamp when older than 24h", async () => {
    const writeFile = vi.fn<(contents: string) => Promise<void>>(async () => undefined)
    const saveTimestamp = vi.fn<(nowMs: number) => Promise<void>>(async () => undefined)
    const backup = nonEmptyBackup()
    const status = await maybeRunAutoBackup({
      isNativeShell: true,
      isEnabled: true,
      lastTimestamp: NOW - DAY_MS - 5_000,
      nowMs: NOW,
      loadBackup: async () => backup,
      writeFile,
      saveTimestamp,
    })
    expect(status).toBe("backed-up")
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(writeFile.mock.calls[0]?.[0]).toBe(JSON.stringify(backup))
    expect(saveTimestamp).toHaveBeenCalledTimes(1)
    expect(saveTimestamp).toHaveBeenCalledWith(NOW)
  })

  it("resolves silently when the write rejects", async () => {
    const status = await maybeRunAutoBackup({
      isNativeShell: true,
      isEnabled: true,
      lastTimestamp: null,
      nowMs: NOW,
      loadBackup: async () => nonEmptyBackup(),
      writeFile: async () => {
        throw new Error("disk full")
      },
      saveTimestamp: async () => undefined,
    })
    expect(status).toBe("skipped-error")
  })

  it("resolves silently when backup creation or timestamp persistence fails", async () => {
    await expect(
      maybeRunAutoBackup({
        isNativeShell: true,
        isEnabled: true,
        lastTimestamp: null,
        nowMs: NOW,
        loadBackup: async () => {
          throw new Error("db locked")
        },
        writeFile: async () => undefined,
        saveTimestamp: async () => undefined,
      }),
    ).resolves.toBe("skipped-error")

    // Timestamp failures still count the file as written.
    await expect(
      maybeRunAutoBackup({
        isNativeShell: true,
        isEnabled: true,
        lastTimestamp: null,
        nowMs: NOW,
        loadBackup: async () => nonEmptyBackup(),
        writeFile: async () => undefined,
        saveTimestamp: async () => {
          throw new Error("prefs locked")
        },
      }),
    ).resolves.toBe("backed-up")
  })

  it("skips when disabled", async () => {
    const loadBackup = vi.fn<() => Promise<unknown>>(async () => nonEmptyBackup())
    await expect(
      maybeRunAutoBackup({
        isNativeShell: true,
        isEnabled: false,
        lastTimestamp: null,
        nowMs: NOW,
        loadBackup,
        writeFile: async () => undefined,
        saveTimestamp: async () => undefined,
      }),
    ).resolves.toBe("skipped-disabled")
    expect(loadBackup).not.toHaveBeenCalled()
  })
})

describe("auto-backup web paths no-op", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("native storage helpers no-op on web without throwing", async () => {
    await expect(readAutoBackupLastTimestamp()).resolves.toBeNull()
    await expect(writeAutoBackupLastTimestamp(NOW)).resolves.toBeUndefined()
    await expect(writeAutoBackupFile('{"hello":"web"}')).resolves.toBeUndefined()
  })

  it("orchestrator skips on web without touching backup, file, or timestamp", async () => {
    const loadBackup = vi.fn<() => Promise<unknown>>(async () => nonEmptyBackup())
    const writeFile = vi.fn<(contents: string) => Promise<void>>(async () => undefined)
    const saveTimestamp = vi.fn<(nowMs: number) => Promise<void>>(async () => undefined)
    await expect(
      maybeRunAutoBackup({
        isNativeShell: false,
        isEnabled: false,
        lastTimestamp: null,
        nowMs: NOW,
        loadBackup,
        writeFile,
        saveTimestamp,
      }),
    ).resolves.toBe("skipped-web")
    expect(loadBackup).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(saveTimestamp).not.toHaveBeenCalled()
  })

  it("production suspend entry resolves silently on web", async () => {
    await expect(runSuspendAutoBackup(NOW)).resolves.toBeUndefined()
  })

  it("suspend wiring attaches hidden/pagehide triggers and cleans up", () => {
    const addDocument = vi.spyOn(document, "addEventListener")
    const addWindow = vi.spyOn(window, "addEventListener")
    const unsubscribe = setupAutoBackupOnSuspend()
    expect(addDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    expect(addWindow).toHaveBeenCalledWith("pagehide", expect.any(Function))

    const removeDocument = vi.spyOn(document, "removeEventListener")
    const removeWindow = vi.spyOn(window, "removeEventListener")
    unsubscribe()
    expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    expect(removeWindow).toHaveBeenCalledWith("pagehide", expect.any(Function))
  })
})
