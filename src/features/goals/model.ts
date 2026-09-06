import { useCallback, useState } from "react"

export const NET_WORTH_GOAL_STORAGE_KEY = "budgetlens.net-worth-goal.v1"
export const NET_WORTH_GOAL_STORAGE_VERSION = 1
export const WEALTH_HISTORY_CHART_STORAGE_KEY = "budgetlens.chart.wealth-history.v1"
export const WEALTH_HISTORY_TARGET_METRIC_KEY = "target"

export interface NetWorthGoal {
  targetAmountMinor: number
  targetDate: string
}

interface StoredNetWorthGoal {
  version: typeof NET_WORTH_GOAL_STORAGE_VERSION
  targetAmountMinor: number
  targetDate: string
}

type ReadableStorage = Pick<Storage, "getItem">
type WritableStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [yearText, monthText, dayText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function isStoredGoal(value: unknown): value is StoredNetWorthGoal {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<StoredNetWorthGoal>
  return (
    record.version === NET_WORTH_GOAL_STORAGE_VERSION &&
    typeof record.targetAmountMinor === "number" &&
    Number.isInteger(record.targetAmountMinor) &&
    record.targetAmountMinor > 0 &&
    typeof record.targetDate === "string" &&
    isValidCalendarDate(record.targetDate)
  )
}

export function parseGoalInput(amountText: string, dateText: string): NetWorthGoal | null {
  const amount = Number(amountText)
  const targetDate = dateText.trim()
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (!isValidCalendarDate(targetDate)) return null
  const targetAmountMinor = Math.round(amount * 100)
  if (!Number.isSafeInteger(targetAmountMinor) || targetAmountMinor <= 0) return null
  return { targetAmountMinor, targetDate }
}

export function loadNetWorthGoal(storage: ReadableStorage | undefined): NetWorthGoal | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(NET_WORTH_GOAL_STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredGoal(parsed)) return null
    return { targetAmountMinor: parsed.targetAmountMinor, targetDate: parsed.targetDate }
  } catch {
    return null
  }
}

function ensureTargetMetricVisible(storage: WritableStorage): void {
  let raw: string | null
  try {
    raw = storage.getItem(WEALTH_HISTORY_CHART_STORAGE_KEY)
  } catch {
    return
  }
  if (raw === null) return
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return
    const settings = parsed as { metricKeys?: unknown }
    if (!Array.isArray(settings.metricKeys)) return
    if (settings.metricKeys.includes(WEALTH_HISTORY_TARGET_METRIC_KEY)) return
    settings.metricKeys = [...settings.metricKeys, WEALTH_HISTORY_TARGET_METRIC_KEY]
    storage.setItem(WEALTH_HISTORY_CHART_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // A corrupt chart payload resets through the chart editor; leave it alone.
  }
}

export function saveNetWorthGoal(storage: WritableStorage | undefined, goal: NetWorthGoal): void {
  if (!storage) return
  const record: StoredNetWorthGoal = {
    version: NET_WORTH_GOAL_STORAGE_VERSION,
    targetAmountMinor: goal.targetAmountMinor,
    targetDate: goal.targetDate,
  }
  try {
    storage.setItem(NET_WORTH_GOAL_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private-mode storage may throw; the goal still applies for this session.
  }
  ensureTargetMetricVisible(storage)
}

export function clearNetWorthGoal(storage: WritableStorage | undefined): void {
  if (!storage) return
  try {
    storage.removeItem(NET_WORTH_GOAL_STORAGE_KEY)
  } catch {
    // Ignore removal failures; the in-memory state still clears.
  }
}

function defaultGoalStorage(): WritableStorage | undefined {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
  } catch {
    // Ignore and fall through to globalThis.
  }
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage
    if (candidate) return candidate
  } catch {
    return undefined
  }
  return undefined
}

export interface NetWorthGoalState {
  goal: NetWorthGoal | null
  save: (goal: NetWorthGoal) => void
  clear: () => void
}

export function useNetWorthGoal(storage: WritableStorage | undefined = defaultGoalStorage()) {
  const [goal, setGoal] = useState<NetWorthGoal | null>(() => loadNetWorthGoal(storage))
  const save = useCallback(
    (next: NetWorthGoal) => {
      saveNetWorthGoal(storage, next)
      setGoal(next)
    },
    [storage],
  )
  const clear = useCallback(() => {
    clearNetWorthGoal(storage)
    setGoal(null)
  }, [storage])
  const state: NetWorthGoalState = { goal, save, clear }
  return state
}
