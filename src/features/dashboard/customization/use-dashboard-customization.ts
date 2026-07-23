import { useEffect, useState } from "react"

import {
  DASHBOARD_CUSTOMIZATION_STORAGE_KEY,
  defaultDashboardCustomization,
  normalizeDashboardCustomization,
  type DashboardCustomization,
} from "./model"

function readCustomization(storage: Storage | undefined): DashboardCustomization {
  if (!storage) return defaultDashboardCustomization
  try {
    return normalizeDashboardCustomization(
      JSON.parse(storage.getItem(DASHBOARD_CUSTOMIZATION_STORAGE_KEY) ?? "null"),
    )
  } catch {
    return defaultDashboardCustomization
  }
}

export function useDashboardCustomization(storage?: Storage) {
  const resolvedStorage =
    storage ?? (typeof window === "undefined" ? undefined : window.localStorage)
  const [customization, setCustomization] = useState(() => readCustomization(resolvedStorage))

  useEffect(() => {
    resolvedStorage?.setItem(DASHBOARD_CUSTOMIZATION_STORAGE_KEY, JSON.stringify(customization))
  }, [customization, resolvedStorage])

  return [customization, setCustomization] as const
}
