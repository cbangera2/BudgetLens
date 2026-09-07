// Smart form defaults for the create-only transaction form.
//
// The new-transaction form pre-fills account + category (+ transaction type)
// from the most recently created transaction. The values live in localStorage
// under a versioned key and every access is best-effort (never throws), so a
// blocked or corrupt store simply yields blank defaults.
//
// NOTE: clearing site data wipes this key and the form falls back to blank
// defaults. That reset is expected behavior, not data loss.

export const TRANSACTION_FORM_DEFAULTS_KEY = "budgetlens.transaction-form-defaults.v1"
export const TRANSACTION_FORM_DEFAULTS_VERSION = 1

export interface TransactionFormDefaults {
  accountName: string
  accountType: string
  category: string
  transactionType: string
}

interface VersionedTransactionFormDefaults extends TransactionFormDefaults {
  version: typeof TRANSACTION_FORM_DEFAULTS_VERSION
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "getItem" | "setItem">

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function loadTransactionFormDefaults(
  storage: ReadableStorage = globalThis.localStorage,
): TransactionFormDefaults | null {
  let raw: string | null
  try {
    raw = storage.getItem(TRANSACTION_FORM_DEFAULTS_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const record = parsed as Partial<VersionedTransactionFormDefaults>
    if (record.version !== TRANSACTION_FORM_DEFAULTS_VERSION) return null
    return {
      accountName: asString(record.accountName),
      accountType: asString(record.accountType),
      category: asString(record.category),
      transactionType: asString(record.transactionType),
    }
  } catch {
    return null
  }
}

export function saveTransactionFormDefaults(
  defaults: TransactionFormDefaults,
  storage: WritableStorage = globalThis.localStorage,
): void {
  const record: VersionedTransactionFormDefaults = {
    version: TRANSACTION_FORM_DEFAULTS_VERSION,
    accountName: asString(defaults.accountName),
    accountType: asString(defaults.accountType),
    category: asString(defaults.category),
    transactionType: asString(defaults.transactionType),
  }
  try {
    storage.setItem(TRANSACTION_FORM_DEFAULTS_KEY, JSON.stringify(record))
  } catch {
    // Best-effort: private-mode storage may throw; the form still saves.
  }
}
