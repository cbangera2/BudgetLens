// Recently used command ids, most recent first. Synthetic data only: stores
// command ids, never finance content.

export const PALETTE_USAGE_KEY = "budgetlens.palette.usage.v1"

const USAGE_CAP = 30

/** Most-recent-first command ids. */
export type CommandUsage = readonly string[]

export function readUsage(storage: Pick<Storage, "getItem">): CommandUsage {
  try {
    const raw = storage.getItem(PALETTE_USAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
  } catch {
    return []
  }
}

export function recordUsage(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
): CommandUsage {
  const usage = readUsage(storage).filter((used) => used !== id)
  const next = [id, ...usage].slice(0, USAGE_CAP)
  try {
    storage.setItem(PALETTE_USAGE_KEY, JSON.stringify(next))
  } catch {
    // Usage persistence is best-effort; ranking still works in memory.
  }
  return next
}
