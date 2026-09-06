import { useCallback, useEffect, useState } from "react"

export const TRANSFER_FLAGS_STORAGE_KEY = "budgetlens.transfers.v1"

export type TransferFlag = "confirmed" | "dismissed"
export type TransferFlags = Record<string, TransferFlag>

function isFlags(value: unknown): value is TransferFlags {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  for (const flag of Object.values(value)) {
    if (flag !== "confirmed" && flag !== "dismissed") return false
  }
  return true
}

export function readTransferFlags(storage: Pick<Storage, "getItem"> = localStorage): TransferFlags {
  try {
    const raw = storage.getItem(TRANSFER_FLAGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (isFlags(parsed)) return { ...parsed }
    if (typeof parsed === "object" && parsed !== null && "confirmed" in parsed) {
      const legacy: unknown = parsed.confirmed
      if (Array.isArray(legacy)) {
        const next: TransferFlags = {}
        for (const id of legacy) {
          if (typeof id === "string" && id) next[id] = "confirmed"
        }
        return next
      }
    }
    return {}
  } catch {
    return {}
  }
}

export function writeTransferFlags(
  flags: TransferFlags,
  storage: Pick<Storage, "setItem" | "removeItem"> = localStorage,
): void {
  try {
    if (Object.keys(flags).length === 0) storage.removeItem(TRANSFER_FLAGS_STORAGE_KEY)
    else storage.setItem(TRANSFER_FLAGS_STORAGE_KEY, JSON.stringify(flags))
  } catch {
    // Local storage may be unavailable (private mode, quota); flags stay in memory.
  }
}

export function confirmedTransferIds(flags: TransferFlags): Set<string> {
  return new Set(
    Object.entries(flags)
      .filter(([, flag]) => flag === "confirmed")
      .map(([id]) => id),
  )
}

export function dismissedTransferIds(flags: TransferFlags): Set<string> {
  return new Set(
    Object.entries(flags)
      .filter(([, flag]) => flag === "dismissed")
      .map(([id]) => id),
  )
}

export function isConfirmedTransfer(id: string, flags: TransferFlags): boolean {
  return flags[id] === "confirmed"
}

export interface TransferFlagActions {
  flags: TransferFlags
  confirmedIds: Set<string>
  dismissedIds: Set<string>
  confirmPair: (expenseId: string, incomeId: string) => void
  dismissPair: (expenseId: string, incomeId: string) => void
  clearFlag: (id: string) => void
}

export function useTransferFlags(): TransferFlagActions {
  const [flags, setFlags] = useState<TransferFlags>(() => readTransferFlags())

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TRANSFER_FLAGS_STORAGE_KEY) setFlags(readTransferFlags())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const update = useCallback((mutate: (next: TransferFlags) => void) => {
    // Re-read persisted flags at action time so flags set in another tab (or a
    // not-yet-processed storage event) are merged instead of overwritten.
    setFlags((previous) => {
      const next: TransferFlags = { ...readTransferFlags(), ...previous }
      mutate(next)
      writeTransferFlags(next)
      return next
    })
  }, [])

  const confirmPair = useCallback(
    (expenseId: string, incomeId: string) => {
      update((next) => {
        next[expenseId] = "confirmed"
        next[incomeId] = "confirmed"
      })
    },
    [update],
  )

  const dismissPair = useCallback(
    (expenseId: string, incomeId: string) => {
      update((next) => {
        next[expenseId] = "dismissed"
        next[incomeId] = "dismissed"
      })
    },
    [update],
  )

  const clearFlag = useCallback(
    (id: string) => {
      update((next) => {
        delete next[id]
      })
    },
    [update],
  )

  return {
    flags,
    confirmedIds: confirmedTransferIds(flags),
    dismissedIds: dismissedTransferIds(flags),
    confirmPair,
    dismissPair,
    clearFlag,
  }
}
