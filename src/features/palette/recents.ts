// Per-command usage counts backing "recent first" ranking. Synthetic data
// only: stores command ids with counts, never finance content.

export interface CommandUsage {
  count: number
  lastUsed: number
}

export const PALETTE_USAGE_KEY = "budgetlens.palette.usage.v1"

const USAGE_CAP = 30

type UsageMap = Record<string, CommandUsage>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isUsage(value: unknown): value is CommandUsage {
  if (!isRecord(value)) return false
  return typeof value.count === "number" && typeof value.lastUsed === "number"
}

export function readUsage(storage: Pick<Storage, "getItem">): UsageMap {
  try {
    const raw = storage.getItem(PALETTE_USAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return {}
    const usage: UsageMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (isUsage(value)) usage[id] = { count: value.count, lastUsed: value.lastUsed }
    }
    return usage
  } catch {
    return {}
  }
}

export function recordUsage(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
  now = Date.now(),
): UsageMap {
  const usage = readUsage(storage)
  const previous = usage[id]
  usage[id] = { count: (previous?.count ?? 0) + 1, lastUsed: now }
  const entries = Object.entries(usage)
    .toSorted((a, b) => b[1].lastUsed - a[1].lastUsed)
    .slice(0, USAGE_CAP)
  try {
    storage.setItem(PALETTE_USAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Usage persistence is best-effort; ranking still works in memory.
  }
  return Object.fromEntries(entries)
}
