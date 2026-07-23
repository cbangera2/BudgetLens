export const DASHBOARD_WIDGETS = ["cashFlow", "categories", "budgets", "recent"] as const
export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]

export interface DashboardPreferences {
  order: DashboardWidgetId[]
  hidden: DashboardWidgetId[]
}

export const defaultDashboardPreferences: DashboardPreferences = {
  order: [...DASHBOARD_WIDGETS],
  hidden: [],
}

function isWidget(value: unknown): value is DashboardWidgetId {
  return value === "cashFlow" || value === "categories" || value === "budgets" || value === "recent"
}

export function normalizeDashboardPreferences(value: unknown): DashboardPreferences {
  if (!value || typeof value !== "object") return defaultDashboardPreferences
  const candidate = value as Partial<DashboardPreferences>
  const candidateOrder = Array.isArray(candidate.order) ? candidate.order.filter(isWidget) : []
  const order = [
    ...new Set(candidateOrder),
    ...DASHBOARD_WIDGETS.filter((id) => !candidateOrder.includes(id)),
  ]
  const hidden = Array.isArray(candidate.hidden)
    ? [...new Set(candidate.hidden.filter(isWidget))]
    : []
  return { order, hidden }
}

export function moveWidget(
  preferences: DashboardPreferences,
  widget: DashboardWidgetId,
  direction: -1 | 1,
): DashboardPreferences {
  const current = preferences.order.indexOf(widget)
  const next = current + direction
  if (current < 0 || next < 0 || next >= preferences.order.length) return preferences
  const order = [...preferences.order]
  const currentWidget = order[current]
  const nextWidget = order[next]
  if (!currentWidget || !nextWidget) return preferences
  order[current] = nextWidget
  order[next] = currentWidget
  return { ...preferences, order }
}

export function toggleWidget(
  preferences: DashboardPreferences,
  widget: DashboardWidgetId,
): DashboardPreferences {
  return {
    ...preferences,
    hidden: preferences.hidden.includes(widget)
      ? preferences.hidden.filter((item) => item !== widget)
      : [...preferences.hidden, widget],
  }
}
