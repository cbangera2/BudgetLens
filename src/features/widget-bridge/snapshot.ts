import type { FinanceSnapshot } from "@/features/assistant/data-tools"
import { formatMinor } from "@/features/assistant/provider"

/**
 * Small versioned snapshot for the WidgetKit widget + Siri App Intent.
 *
 * Pure derivation over {@link FinanceSnapshot} (built by
 * `buildFinanceSnapshot` in `src/features/assistant/data-tools.ts`).
 * No new Dexie queries and no new aggregates live here: net-worth points,
 * budget spend/goal math, and category buckets are reused verbatim and only
 * summed, sliced, and capped so the payload stays widget-sized.
 */

/** Schema version stamped on every payload by {@link buildWidgetSnapshot}. */
export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1

/** Max category buckets kept (largest absolute totals first). */
export const MAX_WIDGET_CATEGORIES = 5

/** Max per-goal budget entries kept (highest spend first). */
export const MAX_WIDGET_BUDGETS = 8

/**
 * Soft size budget for the serialized payload. The builder caps slices so
 * typical snapshots land near 1-2 KB; writer tests assert we stay under this.
 */
export const WIDGET_SNAPSHOT_SIZE_BUDGET_BYTES = 8192

export interface WidgetNetWorthSummary {
  date: string | null
  latestMinor: number | null
  latest: string | null
  deltaMinor: number | null
  delta: string | null
}

export interface WidgetMonthSummary {
  month: string
  spentMinor: number
  spent: string
  budgetMinor: number
  budget: string
  remainingMinor: number
  remaining: string
  over: boolean
}

export interface WidgetCategorySlice {
  category: string
  count: number
  totalMinor: number
  total: string
}

export interface WidgetBudgetSlice {
  category: string
  period: string
  spentMinor: number
  spent: string
  goalMinor: number
  goal: string
  remainingMinor: number
  remaining: string
  over: boolean
}

export interface WidgetSnapshot {
  version: typeof WIDGET_SNAPSHOT_SCHEMA_VERSION
  generatedAt: string
  transactionCount: number
  netWorth: WidgetNetWorthSummary
  month: WidgetMonthSummary
  topCategories: WidgetCategorySlice[]
  budgets: WidgetBudgetSlice[]
}

/** `YYYY-MM` month key for a timestamp (defaults to now). */
export function monthKeyFor(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7)
}

function summarizeNetWorth(finance: FinanceSnapshot): WidgetNetWorthSummary {
  const points = Array.isArray(finance.netWorth) ? finance.netWorth : []
  const latest = points.length > 0 ? points[points.length - 1] : undefined
  if (!latest) {
    return { date: null, latestMinor: null, latest: null, deltaMinor: null, delta: null }
  }
  const previous = points
    .slice(0, -1)
    .toReversed()
    .find((point) => point.series === latest.series)
  const deltaMinor = previous ? latest.valueMinor - previous.valueMinor : null
  return {
    date: latest.date,
    latestMinor: latest.valueMinor,
    latest: latest.value ?? formatMinor(latest.valueMinor),
    deltaMinor,
    delta: deltaMinor === null ? null : formatMinor(deltaMinor),
  }
}

function summarizeMonth(finance: FinanceSnapshot, month: string): WidgetMonthSummary {
  // Month spend vs budget reuses the current-period spend math from
  // `budget_status` (see buildFinanceSnapshot): each goal already carries its
  // period spend, so the widget sums instead of re-querying. Note yearly goals
  // contribute year-to-date spend, matching the assistant's own semantics.
  const goals = Array.isArray(finance.budgets) ? finance.budgets : []
  let spentMinor = 0
  let budgetMinor = 0
  for (const goal of goals) {
    spentMinor += goal.spentMinor
    budgetMinor += goal.goalMinor
  }
  const remainingMinor = budgetMinor - spentMinor
  return {
    month,
    spentMinor,
    spent: formatMinor(spentMinor),
    budgetMinor,
    budget: formatMinor(budgetMinor),
    remainingMinor,
    remaining: formatMinor(remainingMinor),
    over: spentMinor > budgetMinor,
  }
}

/**
 * Build the widget payload from a finance snapshot. Pure and total: empty
 * inputs yield a valid zeroed snapshot (nulls for net worth), never a throw.
 */
export function buildWidgetSnapshot(
  finance: FinanceSnapshot,
  options: { now?: Date } = {},
): WidgetSnapshot {
  const now = options.now ?? new Date()
  const spending = Array.isArray(finance.spending) ? finance.spending : []
  const goals = Array.isArray(finance.budgets) ? finance.budgets : []
  return {
    version: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    transactionCount:
      typeof finance.transactionCount === "number" && Number.isFinite(finance.transactionCount)
        ? finance.transactionCount
        : 0,
    netWorth: summarizeNetWorth(finance),
    month: summarizeMonth(finance, monthKeyFor(now)),
    topCategories: spending.slice(0, MAX_WIDGET_CATEGORIES).map((bucket) => ({
      category: bucket.category,
      count: bucket.count,
      totalMinor: bucket.totalMinor,
      total: bucket.total,
    })),
    budgets: [...goals]
      .toSorted((left, right) => right.spentMinor - left.spentMinor)
      .slice(0, MAX_WIDGET_BUDGETS)
      .map((goal) => ({
        category: goal.category,
        period: goal.period,
        spentMinor: goal.spentMinor,
        spent: goal.spent,
        goalMinor: goal.goalMinor,
        goal: goal.goal,
        remainingMinor: goal.remainingMinor,
        remaining: goal.remaining,
        over: goal.over,
      })),
  }
}

/** Deterministic serialization for the bridge sink. */
export function serializeWidgetSnapshot(snapshot: WidgetSnapshot): string {
  return JSON.stringify(snapshot)
}

export type WidgetSnapshotValidation =
  | { ok: true; snapshot: WidgetSnapshot }
  | { ok: false; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asText(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asMinor(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function versionLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value) return value
  return "missing"
}

function readNetWorth(value: unknown): WidgetNetWorthSummary | null {
  if (!isRecord(value)) return null
  const { date, latestMinor, latest, deltaMinor, delta } = value
  if (date !== null && typeof date !== "string") return null
  if (latestMinor !== null && asMinor(latestMinor) === null) return null
  if (latest !== null && typeof latest !== "string") return null
  if (deltaMinor !== null && asMinor(deltaMinor) === null) return null
  if (delta !== null && typeof delta !== "string") return null
  return {
    date: typeof date === "string" ? date : null,
    latestMinor: asMinor(latestMinor) ?? null,
    latest: typeof latest === "string" ? latest : null,
    deltaMinor: asMinor(deltaMinor) ?? null,
    delta: typeof delta === "string" ? delta : null,
  }
}

function readMonth(value: unknown): WidgetMonthSummary | null {
  if (!isRecord(value)) return null
  const { month, spentMinor, spent, budgetMinor, budget, remainingMinor, remaining, over } = value
  if (typeof month !== "string") return null
  const numbers = [spentMinor, budgetMinor, remainingMinor].map(asMinor)
  if (numbers.some((entry) => entry === null)) return null
  if (typeof spent !== "string" || typeof budget !== "string" || typeof remaining !== "string") {
    return null
  }
  if (typeof over !== "boolean") return null
  const [spentValue, budgetValue, remainingValue] = numbers
  return {
    month,
    spentMinor: spentValue ?? 0,
    spent,
    budgetMinor: budgetValue ?? 0,
    budget,
    remainingMinor: remainingValue ?? 0,
    remaining,
    over,
  }
}

function readCategorySlice(value: unknown): WidgetCategorySlice | null {
  if (!isRecord(value)) return null
  if (typeof value.category !== "string") return null
  const count = asMinor(value.count)
  const totalMinor = asMinor(value.totalMinor)
  if (count === null || totalMinor === null || typeof value.total !== "string") return null
  return { category: value.category, count, totalMinor, total: value.total }
}

function readBudgetSlice(value: unknown): WidgetBudgetSlice | null {
  if (!isRecord(value)) return null
  const { category, period, spentMinor, spent, goalMinor, goal, remainingMinor, remaining, over } =
    value
  if (typeof category !== "string" || typeof period !== "string") return null
  const numbers = [spentMinor, goalMinor, remainingMinor].map(asMinor)
  if (numbers.some((entry) => entry === null)) return null
  if (typeof spent !== "string" || typeof goal !== "string" || typeof remaining !== "string") {
    return null
  }
  if (typeof over !== "boolean") return null
  const [spentValue, goalValue, remainingValue] = numbers
  return {
    category,
    period,
    spentMinor: spentValue ?? 0,
    spent,
    goalMinor: goalValue ?? 0,
    goal,
    remainingMinor: remainingValue ?? 0,
    remaining,
    over,
  }
}

function readSlices<T>(value: unknown, read: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const slices: T[] = []
  for (const entry of value) {
    const slice = read(entry)
    if (!slice) return null
    slices.push(slice)
  }
  return slices
}

/**
 * Validate an unknown payload against the current schema version. Returns a
 * reason instead of throwing; unknown/future versions are rejected so the
 * widget and the Siri intent can fall back to their placeholder UI.
 */
export function validateWidgetSnapshot(payload: unknown): WidgetSnapshotValidation {
  try {
    if (!isRecord(payload)) return { ok: false, reason: "not-an-object" }
    if (payload.version !== WIDGET_SNAPSHOT_SCHEMA_VERSION) {
      return { ok: false, reason: `unsupported-version:${versionLabel(payload.version)}` }
    }
    const generatedAt = asText(payload.generatedAt)
    if (!generatedAt) return { ok: false, reason: "missing-generatedAt" }
    const transactionCount = asMinor(payload.transactionCount)
    if (transactionCount === null) return { ok: false, reason: "missing-transactionCount" }
    const netWorth = readNetWorth(payload.netWorth)
    if (!netWorth) return { ok: false, reason: "missing-netWorth" }
    const month = readMonth(payload.month)
    if (!month) return { ok: false, reason: "missing-month" }
    const topCategories = readSlices(payload.topCategories, readCategorySlice)
    if (!topCategories) return { ok: false, reason: "missing-topCategories" }
    const budgets = readSlices(payload.budgets, readBudgetSlice)
    if (!budgets) return { ok: false, reason: "missing-budgets" }
    return {
      ok: true,
      snapshot: {
        version: WIDGET_SNAPSHOT_SCHEMA_VERSION,
        generatedAt,
        transactionCount,
        netWorth,
        month,
        topCategories,
        budgets,
      },
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid-snapshot" }
  }
}
