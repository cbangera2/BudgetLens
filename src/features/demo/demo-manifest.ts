// Tracks exactly which budget/group rows the demo seeder created, so the
// first real import can remove them again. ids are random per seed, so they
// cannot be rediscovered from content. Leaf module (no imports) to avoid a
// cycle: demo-seed writes it, import-service reads and clears it.

export const DEMO_MANIFEST_KEY = "budgetlens.demo-manifest.v1"

export interface DemoManifest {
  budgetIds: string[]
  groupIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0)
}

export function readDemoManifest(
  storage: Pick<Storage, "getItem"> = globalThis.localStorage,
): DemoManifest | null {
  try {
    const raw = storage.getItem(DEMO_MANIFEST_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return null
    const budgetIds = asIdList(parsed.budgetIds)
    const groupIds = asIdList(parsed.groupIds)
    if (budgetIds.length === 0 && groupIds.length === 0) return null
    return { budgetIds, groupIds }
  } catch {
    return null
  }
}

export function writeDemoManifest(
  manifest: DemoManifest,
  storage: Pick<Storage, "setItem"> = globalThis.localStorage,
): void {
  try {
    storage.setItem(DEMO_MANIFEST_KEY, JSON.stringify(manifest))
  } catch {
    // Private-mode storage may throw; seeding still succeeds, and replacement
    // falls back to import-linked rows only (budgets/groups are re-seedable).
  }
}

export function clearDemoManifest(
  storage: Pick<Storage, "removeItem"> = globalThis.localStorage,
): void {
  try {
    storage.removeItem(DEMO_MANIFEST_KEY)
  } catch {
    // Best-effort only.
  }
}
