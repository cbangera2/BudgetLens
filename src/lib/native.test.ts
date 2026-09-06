import { afterEach, describe, expect, it, vi } from "vitest"

import {
  backupFilename,
  checkBiometrics,
  clearAssistantKey,
  haptic,
  isNative,
  loadAssistantKey,
  requestBiometricUnlock,
  saveAssistantKey,
  shareBackupFile,
} from "@/lib/native"

describe("native adapter on web (no bridge)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("reports non-native without a bridge", () => {
    expect(isNative()).toBe(false)
  })

  it("haptics are a silent no-op on web", async () => {
    await expect(haptic("light")).resolves.toBeUndefined()
    await expect(haptic("medium")).resolves.toBeUndefined()
    await expect(haptic("success")).resolves.toBeUndefined()
    await expect(haptic("error")).resolves.toBeUndefined()
  })

  it("builds collision-safe backup filenames", () => {
    expect(backupFilename(new Date("2026-09-05T19:30:00.000Z"))).toBe(
      "budgetlens-backup-2026-09-05T19-30.json",
    )
  })

  it("downloads the backup via anchor on web", async () => {
    const created: Blob[] = []
    const clicked: string[] = []
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob): string => {
        created.push(blob)
        return "blob:mock"
      },
      revokeObjectURL: (): void => {},
    })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download)
      })

    await shareBackupFile("budgetlens-backup-test.json", '{"hello":"web"}')

    expect(created).toHaveLength(1)
    expect(created[0]?.type).toBe("application/json")
    expect(clicked).toEqual(["budgetlens-backup-test.json"])
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it("keeps assistant keys in memory on web", async () => {
    expect(await loadAssistantKey("openrouter")).toBeNull()
    await saveAssistantKey("openrouter", "sk-test")
    expect(await loadAssistantKey("openrouter")).toBe("sk-test")
    await saveAssistantKey("openrouter", "")
    expect(await loadAssistantKey("openrouter")).toBe("sk-test")
    await clearAssistantKey("openrouter")
    expect(await loadAssistantKey("openrouter")).toBeNull()
  })

  it("reports biometrics unavailable on web", async () => {
    await expect(checkBiometrics()).resolves.toEqual({ available: false, biometryType: "none" })
    await expect(requestBiometricUnlock("test")).resolves.toBe(false)
  })
})
