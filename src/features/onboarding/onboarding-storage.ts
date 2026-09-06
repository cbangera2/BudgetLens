export const ONBOARDING_STORAGE_KEY = "budgetlens.onboarding.v1"
export const ONBOARDING_STORAGE_VERSION = 1

export type OnboardingChoice = "demo" | "import" | "empty"

export interface OnboardingRecord {
  version: typeof ONBOARDING_STORAGE_VERSION
  choice: OnboardingChoice
  completedAt: string
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "getItem" | "setItem">

function isOnboardingChoice(value: unknown): value is OnboardingChoice {
  return value === "demo" || value === "import" || value === "empty"
}

export function readOnboardingChoice(storage: ReadableStorage): OnboardingChoice | null {
  let raw: string | null
  try {
    raw = storage.getItem(ONBOARDING_STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const record = parsed as Partial<OnboardingRecord>
    if (record.version !== ONBOARDING_STORAGE_VERSION) return null
    if (!isOnboardingChoice(record.choice)) return null
    return record.choice
  } catch {
    return null
  }
}

export function hasCompletedOnboarding(storage: ReadableStorage): boolean {
  return readOnboardingChoice(storage) !== null
}

export function recordOnboardingChoice(
  storage: WritableStorage,
  choice: OnboardingChoice,
  completedAt: string = new Date().toISOString(),
): OnboardingRecord {
  const record: OnboardingRecord = {
    version: ONBOARDING_STORAGE_VERSION,
    choice,
    completedAt,
  }
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private-mode storage may throw; the welcome screen will show again next launch.
  }
  return record
}

const memoryFallback = new Map<string, string>()

function memoryStorageFallback(): WritableStorage {
  return {
    getItem: (key: string) => memoryFallback.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryFallback.set(key, value)
    },
  }
}

export function safeOnboardingStorage(): WritableStorage {
  try {
    const storage = globalThis.localStorage
    if (!storage) return memoryStorageFallback()
    // Probe: some browsers throw on use (not access) when storage is blocked.
    storage.getItem(ONBOARDING_STORAGE_KEY)
    return storage
  } catch {
    return memoryStorageFallback()
  }
}
