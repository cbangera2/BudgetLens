export const INSIGHTS_DISMISSAL_STORAGE_KEY = "budgetlens.insights.dismissals.v1"
export const INSIGHTS_DISMISSAL_STORAGE_VERSION = 1

export interface InsightsDismissalRecord {
  version: typeof INSIGHTS_DISMISSAL_STORAGE_VERSION
  dismissedInsightIds: string[]
  dismissedCards: string[]
}

export interface InsightsDismissalState {
  insights: Set<string>
  cards: Set<string>
}

type DismissalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined

function emptyState(): InsightsDismissalState {
  return { insights: new Set(), cards: new Set() }
}

function isRecord(value: unknown): value is InsightsDismissalRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Partial<InsightsDismissalRecord>
  return (
    record.version === INSIGHTS_DISMISSAL_STORAGE_VERSION &&
    Array.isArray(record.dismissedInsightIds) &&
    record.dismissedInsightIds.every((entry) => typeof entry === "string") &&
    Array.isArray(record.dismissedCards) &&
    record.dismissedCards.every((entry) => typeof entry === "string")
  )
}

export function readInsightsDismissals(storage: DismissalStorage): InsightsDismissalState {
  if (!storage) return emptyState()
  try {
    const raw = storage.getItem(INSIGHTS_DISMISSAL_STORAGE_KEY)
    if (raw === null) return emptyState()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return emptyState()
    return {
      insights: new Set(parsed.dismissedInsightIds),
      cards: new Set(parsed.dismissedCards),
    }
  } catch {
    return emptyState()
  }
}

function persist(storage: DismissalStorage, state: InsightsDismissalState): void {
  if (!storage) return
  const record: InsightsDismissalRecord = {
    version: INSIGHTS_DISMISSAL_STORAGE_VERSION,
    dismissedInsightIds: [...state.insights].toSorted(),
    dismissedCards: [...state.cards].toSorted(),
  }
  try {
    storage.setItem(INSIGHTS_DISMISSAL_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Private-mode storage may throw; dismissals stay in memory only.
  }
}

export function isInsightDismissed(state: InsightsDismissalState, id: string): boolean {
  return state.insights.has(id)
}

export function isCardDismissed(state: InsightsDismissalState, digestKey: string): boolean {
  return state.cards.has(digestKey)
}

export function dismissInsight(storage: DismissalStorage, id: string): InsightsDismissalState {
  const state = readInsightsDismissals(storage)
  state.insights.add(id)
  persist(storage, state)
  return state
}

export function dismissInsightsCard(
  storage: DismissalStorage,
  digestKey: string,
): InsightsDismissalState {
  const state = readInsightsDismissals(storage)
  state.cards.add(digestKey)
  persist(storage, state)
  return state
}

export function restoreInsight(storage: DismissalStorage, id: string): InsightsDismissalState {
  const state = readInsightsDismissals(storage)
  state.insights.delete(id)
  persist(storage, state)
  return state
}

export function restoreInsightsCard(
  storage: DismissalStorage,
  digestKey: string,
): InsightsDismissalState {
  const state = readInsightsDismissals(storage)
  state.cards.delete(digestKey)
  persist(storage, state)
  return state
}

export function restoreDigestInsights(
  storage: DismissalStorage,
  digestKey: string,
): InsightsDismissalState {
  const state = readInsightsDismissals(storage)
  for (const id of state.insights) {
    if (id.startsWith(`${digestKey}|`)) state.insights.delete(id)
  }
  persist(storage, state)
  return state
}

export function clearInsightsDismissals(storage: DismissalStorage): void {
  if (!storage) return
  try {
    storage.removeItem(INSIGHTS_DISMISSAL_STORAGE_KEY)
  } catch {
    // Best-effort; a missed clear only keeps dismissals hidden.
  }
}
