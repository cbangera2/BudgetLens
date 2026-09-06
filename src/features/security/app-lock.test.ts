import { describe, expect, it } from "vitest"

import { APP_LOCK_KEY, readAppLockMode, writeAppLockMode } from "@/features/security/app-lock"

function memoryStorage(initial?: string | null): Pick<Storage, "getItem" | "setItem"> {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
}

describe("app lock mode storage", () => {
  it("defaults to off when nothing is stored", () => {
    expect(readAppLockMode(memoryStorage())).toBe("off")
    expect(readAppLockMode(memoryStorage(""))).toBe("off")
  })

  it("rejects unknown values", () => {
    expect(readAppLockMode(memoryStorage('"always"'))).toBe("off")
    expect(readAppLockMode(memoryStorage("not-json"))).toBe("off")
  })

  it("round-trips the biometric mode", () => {
    const storage = memoryStorage()
    writeAppLockMode(storage, "biometric")
    expect(storage.getItem(APP_LOCK_KEY)).toBe('"biometric"')
    expect(readAppLockMode(storage)).toBe("biometric")
    writeAppLockMode(storage, "off")
    expect(readAppLockMode(storage)).toBe("off")
  })
})
