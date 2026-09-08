import { useCallback, useEffect, useState } from "react"

export const TAX_FLAGS_STORAGE_KEY = "budgetlens.tax-flags.v1"
export const TAX_FLAGS_VERSION = 1

export type TaxFlag = "deductible" | "taxable" | "charitable" | "none"
export type TaxFlags = Record<string, TaxFlag>

function isTaxFlag(value: unknown): value is TaxFlag {
  return value === "deductible" || value === "taxable" || value === "charitable" || value === "none"
}

function isTaxFlags(value: unknown): value is TaxFlags {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return Object.entries(value).every(
    ([key, flag]) => typeof key === "string" && key.length > 0 && isTaxFlag(flag),
  )
}

interface VersionedTaxFlags {
  version: typeof TAX_FLAGS_VERSION
  flags: TaxFlags
}

function isVersionedTaxFlags(value: unknown): value is VersionedTaxFlags {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<VersionedTaxFlags>
  return record.version === TAX_FLAGS_VERSION && isTaxFlags(record.flags)
}

export function readTaxFlags(storage: Pick<Storage, "getItem"> = localStorage): TaxFlags {
  try {
    const raw = storage.getItem(TAX_FLAGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (isVersionedTaxFlags(parsed)) return { ...parsed.flags }
    // Legacy shape tolerance: a bare record written before the versioned
    // envelope still loads when every entry validates.
    if (isTaxFlags(parsed)) return { ...parsed }
    return {}
  } catch {
    return {}
  }
}

export function writeTaxFlags(
  flags: TaxFlags,
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage,
): void {
  try {
    if (Object.keys(flags).length === 0) storage.removeItem(TAX_FLAGS_STORAGE_KEY)
    else {
      const record: VersionedTaxFlags = { version: TAX_FLAGS_VERSION, flags }
      storage.setItem(TAX_FLAGS_STORAGE_KEY, JSON.stringify(record))
    }
  } catch {
    // Local storage may be unavailable (private mode, quota); flags stay in memory.
  }
}

export interface TaxFlagActions {
  flags: TaxFlags
  setFlag: (category: string, flag: TaxFlag | null) => void
  clearFlags: () => void
}

export function useTaxFlags(): TaxFlagActions {
  const [flags, setFlags] = useState<TaxFlags>(() => readTaxFlags())

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TAX_FLAGS_STORAGE_KEY) setFlags(readTaxFlags())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setFlag = useCallback((category: string, flag: TaxFlag | null) => {
    const name = category.trim()
    if (!name) return
    setFlags((previous) => {
      // Re-read persisted flags at action time so flags set in another tab
      // (or a not-yet-processed storage event) merge instead of overwrite.
      const next: TaxFlags = { ...readTaxFlags(), ...previous }
      if (flag === null || flag === "none") {
        if (flag === "none") next[name] = "none"
        else delete next[name]
      } else {
        next[name] = flag
      }
      writeTaxFlags(next)
      return next
    })
  }, [])

  const clearFlags = useCallback(() => {
    setFlags(() => {
      writeTaxFlags({})
      return {}
    })
  }, [])

  return { flags, setFlag, clearFlags }
}
