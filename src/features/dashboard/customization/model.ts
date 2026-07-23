import { arrayMove } from "@dnd-kit/sortable"

import { DASHBOARD_MODULE_IDS, isDashboardModuleId, type DashboardModuleId } from "./catalog"

export const DASHBOARD_CUSTOMIZATION_STORAGE_KEY = "budgetlens.dashboard.customization.v2"

export interface DashboardCustomization {
  version: 2
  order: DashboardModuleId[]
  hidden: DashboardModuleId[]
  removed: DashboardModuleId[]
}

export const defaultDashboardCustomization: DashboardCustomization = {
  version: 2,
  order: [...DASHBOARD_MODULE_IDS],
  hidden: [],
  removed: [],
}

function uniqueModuleIds(value: unknown): DashboardModuleId[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isDashboardModuleId))]
}

export function normalizeDashboardCustomization(value: unknown): DashboardCustomization {
  if (!value || typeof value !== "object") return defaultDashboardCustomization
  const candidate = value as Partial<DashboardCustomization>
  const removed = uniqueModuleIds(candidate.removed)
  const ordered = uniqueModuleIds(candidate.order).filter((id) => !removed.includes(id))
  const order = [
    ...ordered,
    ...DASHBOARD_MODULE_IDS.filter((id) => !removed.includes(id) && !ordered.includes(id)),
  ]
  const hidden = uniqueModuleIds(candidate.hidden).filter(
    (id) => !removed.includes(id) && order.includes(id),
  )
  return { version: 2, order, hidden, removed }
}

export function moveDashboardModule(
  customization: DashboardCustomization,
  id: DashboardModuleId,
  direction: -1 | 1,
): DashboardCustomization {
  const from = customization.order.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= customization.order.length) return customization
  return { ...customization, order: arrayMove(customization.order, from, to) }
}

export function reorderDashboardModules(
  customization: DashboardCustomization,
  activeId: DashboardModuleId,
  overId: DashboardModuleId,
): DashboardCustomization {
  const from = customization.order.indexOf(activeId)
  const to = customization.order.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return customization
  return { ...customization, order: arrayMove(customization.order, from, to) }
}

export function setDashboardModuleVisibility(
  customization: DashboardCustomization,
  id: DashboardModuleId,
  visible: boolean,
): DashboardCustomization {
  if (!customization.order.includes(id)) return customization
  return {
    ...customization,
    hidden: visible
      ? customization.hidden.filter((moduleId) => moduleId !== id)
      : [...new Set([...customization.hidden, id])],
  }
}

export function removeDashboardModule(
  customization: DashboardCustomization,
  id: DashboardModuleId,
): DashboardCustomization {
  return {
    ...customization,
    order: customization.order.filter((moduleId) => moduleId !== id),
    hidden: customization.hidden.filter((moduleId) => moduleId !== id),
    removed: [...new Set([...customization.removed, id])],
  }
}

export function addDashboardModule(
  customization: DashboardCustomization,
  id: DashboardModuleId,
): DashboardCustomization {
  if (!customization.removed.includes(id) && customization.order.includes(id)) return customization
  return {
    ...customization,
    order: [...customization.order.filter((moduleId) => moduleId !== id), id],
    hidden: customization.hidden.filter((moduleId) => moduleId !== id),
    removed: customization.removed.filter((moduleId) => moduleId !== id),
  }
}
