import { isValidCloseMonth } from "./month"

export const MONTHLY_CLOSE_STORAGE_KEY = "budgetlens.monthly-close.v1"
export const MONTHLY_CLOSE_STORAGE_VERSION = 1 as const

export type MonthlyCloseStep = 1 | 2 | 3

export type RecurringDecision = "confirmed" | "missing"

export interface MonthlyCloseRecord {
  month: string
  step: MonthlyCloseStep
  started: boolean
  triageSkipped: boolean
  recurringSkipped: boolean
  confirmed: Record<string, RecurringDecision>
  bannerDismissed: boolean
  skippedMonth: boolean
  closedAt: string | null
  updatedAt: string
}

export interface MonthlyCloseStoreShape {
  version: typeof MONTHLY_CLOSE_STORAGE_VERSION
  months: Record<string, MonthlyCloseRecord>
}

export type MonthlyCloseStorage =
  | Pick<Storage, "getItem" | "setItem" | "removeItem">
  | null
  | undefined

export function emptyCloseRecord(month: string, nowIso?: string): MonthlyCloseRecord {
  return {
    month,
    step: 1,
    started: false,
    triageSkipped: false,
    recurringSkipped: false,
    confirmed: {},
    bannerDismissed: false,
    skippedMonth: false,
    closedAt: null,
    updatedAt: nowIso ?? new Date().toISOString(),
  }
}

function isStep(value: unknown): value is MonthlyCloseStep {
  return value === 1 || value === 2 || value === 3
}

function isDecision(value: unknown): value is RecurringDecision {
  return value === "confirmed" || value === "missing"
}

function isRecord(value: unknown): value is MonthlyCloseRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<MonthlyCloseRecord>
  if (typeof record.month !== "string" || !isValidCloseMonth(record.month)) return false
  if (!isStep(record.step)) return false
  if (typeof record.started !== "boolean") return false
  if (typeof record.triageSkipped !== "boolean") return false
  if (typeof record.recurringSkipped !== "boolean") return false
  if (typeof record.confirmed !== "object" || record.confirmed === null) return false
  for (const decision of Object.values(record.confirmed)) {
    if (!isDecision(decision)) return false
  }
  if (typeof record.bannerDismissed !== "boolean") return false
  if (typeof record.skippedMonth !== "boolean") return false
  if (record.closedAt !== null && typeof record.closedAt !== "string") return false
  return typeof record.updatedAt === "string"
}

function emptyStore(): MonthlyCloseStoreShape {
  return { version: MONTHLY_CLOSE_STORAGE_VERSION, months: {} }
}

export function readMonthlyCloseStore(storage: MonthlyCloseStorage): MonthlyCloseStoreShape {
  if (!storage) return emptyStore()
  try {
    const raw = storage.getItem(MONTHLY_CLOSE_STORAGE_KEY)
    if (raw === null) return emptyStore()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return emptyStore()
    const candidate = parsed as Partial<MonthlyCloseStoreShape>
    if (candidate.version !== MONTHLY_CLOSE_STORAGE_VERSION) return emptyStore()
    if (typeof candidate.months !== "object" || candidate.months === null) return emptyStore()
    const months: Record<string, MonthlyCloseRecord> = {}
    for (const [key, value] of Object.entries(candidate.months)) {
      if (isValidCloseMonth(key) && isRecord(value) && value.month === key) {
        months[key] = { ...value, confirmed: { ...value.confirmed } }
      }
    }
    return { version: MONTHLY_CLOSE_STORAGE_VERSION, months }
  } catch {
    return emptyStore()
  }
}

export function writeMonthlyCloseStore(
  storage: MonthlyCloseStorage,
  shape: MonthlyCloseStoreShape,
): void {
  if (!storage) return
  try {
    storage.setItem(
      MONTHLY_CLOSE_STORAGE_KEY,
      JSON.stringify({ version: MONTHLY_CLOSE_STORAGE_VERSION, months: shape.months }),
    )
  } catch {
    // Private-mode storage may throw; state stays in memory only.
  }
}

export function getMonthRecord(
  shape: MonthlyCloseStoreShape,
  month: string,
  nowIso?: string,
): MonthlyCloseRecord {
  const existing = shape.months[month]
  if (existing) return { ...existing, confirmed: { ...existing.confirmed } }
  return emptyCloseRecord(month, nowIso)
}

function touch(record: MonthlyCloseRecord, nowIso?: string): MonthlyCloseRecord {
  return { ...record, updatedAt: nowIso ?? new Date().toISOString() }
}

function upsert(shape: MonthlyCloseStoreShape, record: MonthlyCloseRecord): MonthlyCloseStoreShape {
  return {
    version: MONTHLY_CLOSE_STORAGE_VERSION,
    months: { ...shape.months, [record.month]: record },
  }
}

function withRecord(
  shape: MonthlyCloseStoreShape,
  month: string,
  mutate: (record: MonthlyCloseRecord) => MonthlyCloseRecord,
  nowIso?: string,
): MonthlyCloseStoreShape {
  const base = getMonthRecord(shape, month, nowIso)
  return upsert(shape, mutate(base))
}

export function startClose(
  shape: MonthlyCloseStoreShape,
  month: string,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) =>
      touch(
        {
          ...record,
          started: true,
          step: record.closedAt ? 3 : record.step,
          skippedMonth: false,
        },
        nowIso,
      ),
    nowIso,
  )
}

export function setCloseStep(
  shape: MonthlyCloseStoreShape,
  month: string,
  step: MonthlyCloseStep,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) => touch({ ...record, started: true, step }, nowIso),
    nowIso,
  )
}

export function completeTriageStep(
  shape: MonthlyCloseStoreShape,
  month: string,
  skipped: boolean,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) => touch({ ...record, started: true, step: 2, triageSkipped: skipped }, nowIso),
    nowIso,
  )
}

export function completeRecurringStep(
  shape: MonthlyCloseStoreShape,
  month: string,
  skipped: boolean,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) => touch({ ...record, started: true, step: 3, recurringSkipped: skipped }, nowIso),
    nowIso,
  )
}

export function setRecurringDecision(
  shape: MonthlyCloseStoreShape,
  month: string,
  key: string,
  decision: RecurringDecision,
  nowIso?: string,
): MonthlyCloseStoreShape {
  const trimmed = key.trim()
  if (!trimmed) return shape
  return withRecord(
    shape,
    month,
    (record) =>
      touch(
        { ...record, started: true, confirmed: { ...record.confirmed, [trimmed]: decision } },
        nowIso,
      ),
    nowIso,
  )
}

export function clearRecurringDecision(
  shape: MonthlyCloseStoreShape,
  month: string,
  key: string,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) => {
      const confirmed = { ...record.confirmed }
      delete confirmed[key]
      return touch({ ...record, confirmed }, nowIso)
    },
    nowIso,
  )
}

export function closeMonth(
  shape: MonthlyCloseStoreShape,
  month: string,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) =>
      touch(
        { ...record, started: true, step: 3, closedAt: nowIso ?? new Date().toISOString() },
        nowIso,
      ),
    nowIso,
  )
}

export function reopenMonth(
  shape: MonthlyCloseStoreShape,
  month: string,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) =>
      touch({ ...record, started: true, step: 3, closedAt: null, skippedMonth: false }, nowIso),
    nowIso,
  )
}

export function dismissCloseBanner(
  shape: MonthlyCloseStoreShape,
  month: string,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) => touch({ ...record, bannerDismissed: true }, nowIso),
    nowIso,
  )
}

export function skipCloseMonth(
  shape: MonthlyCloseStoreShape,
  month: string,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) => touch({ ...record, skippedMonth: true }, nowIso),
    nowIso,
  )
}

export function unskipCloseMonth(
  shape: MonthlyCloseStoreShape,
  month: string,
  nowIso?: string,
): MonthlyCloseStoreShape {
  return withRecord(
    shape,
    month,
    (record) => touch({ ...record, skippedMonth: false, bannerDismissed: false }, nowIso),
    nowIso,
  )
}

export function isMonthClosed(shape: MonthlyCloseStoreShape, month: string): boolean {
  const record = shape.months[month]
  if (!record) return false
  return record.closedAt !== null
}

export function isMonthSkipped(shape: MonthlyCloseStoreShape, month: string): boolean {
  return shape.months[month]?.skippedMonth === true
}

export function shouldShowCloseBanner(
  shape: MonthlyCloseStoreShape,
  month: string,
  hasActivity: boolean,
): boolean {
  if (!hasActivity) return false
  const record = shape.months[month]
  if (!record) return true
  if (record.closedAt !== null) return false
  if (record.skippedMonth) return false
  if (record.bannerDismissed) return false
  if (record.started) return false
  return true
}
