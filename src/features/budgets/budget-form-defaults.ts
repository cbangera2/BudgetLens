// Smart form defaults for the budget goal form.
//
// The budget form remembers the last-used period (monthly/yearly) in
// localStorage under a versioned key. Every access is best-effort (never
// throws), so a blocked or corrupt store simply yields the blank default
// ("monthly").
//
// NOTE: clearing site data wipes this key and the form falls back to
// "monthly". That reset is expected behavior, not data loss.

export const BUDGET_FORM_DEFAULTS_KEY = "budgetlens.budget-form-defaults.v1"
export const BUDGET_FORM_DEFAULTS_VERSION = 1

export type BudgetFormPeriod = "monthly" | "yearly"

interface VersionedBudgetFormDefaults {
  version: typeof BUDGET_FORM_DEFAULTS_VERSION
  period: BudgetFormPeriod
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "getItem" | "setItem">

function isBudgetFormPeriod(value: unknown): value is BudgetFormPeriod {
  return value === "monthly" || value === "yearly"
}

export function loadBudgetFormDefaults(
  storage: ReadableStorage = globalThis.localStorage,
): BudgetFormPeriod | null {
  let raw: string | null
  try {
    raw = storage.getItem(BUDGET_FORM_DEFAULTS_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const record = parsed as Partial<VersionedBudgetFormDefaults>
    if (record.version !== BUDGET_FORM_DEFAULTS_VERSION) return null
    if (!isBudgetFormPeriod(record.period)) return null
    return record.period
  } catch {
    return null
  }
}

export function saveBudgetFormDefaults(
  period: BudgetFormPeriod,
  storage: WritableStorage = globalThis.localStorage,
): void {
  const record: VersionedBudgetFormDefaults = {
    version: BUDGET_FORM_DEFAULTS_VERSION,
    period,
  }
  try {
    storage.setItem(BUDGET_FORM_DEFAULTS_KEY, JSON.stringify(record))
  } catch {
    // Best-effort: private-mode storage may throw; the goal still saves.
  }
}
