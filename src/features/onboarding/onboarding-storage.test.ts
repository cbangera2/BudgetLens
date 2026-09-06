import { beforeEach, describe, expect, it } from "vitest"

import {
  hasCompletedOnboarding,
  ONBOARDING_STORAGE_KEY,
  recordOnboardingChoice,
  readOnboardingChoice,
  safeOnboardingStorage,
} from "@/features/onboarding/onboarding-storage"

function memoryStorage(initial?: Record<string, string>): Pick<Storage, "getItem" | "setItem"> {
  const store = new Map<string, string>(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

describe("onboarding flag", () => {
  let storage: Pick<Storage, "getItem" | "setItem">

  beforeEach(() => {
    storage = memoryStorage()
  })

  it("reports no choice on first launch", () => {
    expect(readOnboardingChoice(storage)).toBeNull()
    expect(hasCompletedOnboarding(storage)).toBe(false)
  })

  it("persists and reads back each choice", () => {
    for (const choice of ["demo", "import", "empty"] as const) {
      const target = memoryStorage()
      const record = recordOnboardingChoice(target, choice, "2026-01-01T00:00:00.000Z")
      expect(record).toEqual({
        version: 1,
        choice,
        completedAt: "2026-01-01T00:00:00.000Z",
      })
      expect(readOnboardingChoice(target)).toBe(choice)
      expect(hasCompletedOnboarding(target)).toBe(true)
    }
  })

  it("stores a versioned record under the versioned key", () => {
    const seen: string[] = []
    const target: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => null,
      setItem: (key: string, value: string) => {
        seen.push(`${key}=${value}`)
      },
    }
    recordOnboardingChoice(target, "empty")
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/^budgetlens\.onboarding\.v1=/)
    expect(JSON.parse(seen[0]!.split("=", 2)[1]!)).toMatchObject({ version: 1, choice: "empty" })
  })

  it("reprompts when the stored value is malformed", () => {
    for (const raw of ["not-json", '"demo"', "42", "null", "[]"]) {
      const target = memoryStorage({ [ONBOARDING_STORAGE_KEY]: raw })
      expect(readOnboardingChoice(target)).toBeNull()
      expect(hasCompletedOnboarding(target)).toBe(false)
    }
  })

  it("reprompts when the version or choice is unknown", () => {
    const cases = [
      { version: 0, choice: "demo" },
      { version: 2, choice: "demo" },
      { choice: "demo" },
      { version: 1 },
      { version: 1, choice: "tour" },
      { version: 1, choice: null },
      { version: "1", choice: "demo" },
    ]
    for (const value of cases) {
      const target = memoryStorage({ [ONBOARDING_STORAGE_KEY]: JSON.stringify(value) })
      expect(readOnboardingChoice(target)).toBeNull()
    }
  })

  it("returns null when storage throws", () => {
    const failing: Pick<Storage, "getItem" | "setItem"> = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("denied")
      },
    }
    expect(readOnboardingChoice(failing)).toBeNull()
    expect(hasCompletedOnboarding(failing)).toBe(false)
    expect(() => recordOnboardingChoice(failing, "demo")).not.toThrow()
  })

  it("latest choice wins", () => {
    recordOnboardingChoice(storage, "empty")
    recordOnboardingChoice(storage, "demo")
    expect(readOnboardingChoice(storage)).toBe("demo")
  })
})

describe("safeOnboardingStorage", () => {
  it("returns working storage normally", () => {
    const storage = safeOnboardingStorage()
    storage.setItem("probe", "1")
    expect(storage.getItem("probe")).toBe("1")
  })

  it("falls back to memory when Web Storage access is blocked", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: (): Storage => {
        throw new Error("blocked")
      },
    })
    try {
      const storage = safeOnboardingStorage()
      storage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({ version: 1, choice: "demo", completedAt: "x" }),
      )
      expect(readOnboardingChoice(storage)).toBe("demo")
      expect(readOnboardingChoice(safeOnboardingStorage())).toBe("demo")
    } finally {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor)
    }
  })
})
