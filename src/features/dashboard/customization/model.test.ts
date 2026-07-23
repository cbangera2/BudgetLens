import {
  addDashboardModule,
  defaultDashboardCustomization,
  moveDashboardModule,
  normalizeDashboardCustomization,
  removeDashboardModule,
  reorderDashboardModules,
  setDashboardModuleVisibility,
} from "./model"

describe("dashboard customization model", () => {
  it("normalizes unknown, duplicate, removed, and newly introduced modules", () => {
    const normalized = normalizeDashboardCustomization({
      order: ["transactions", "transactions", "not-real"],
      hidden: ["transactions", "imports"],
      removed: ["imports", "not-real"],
    })

    expect(normalized.order[0]).toBe("transactions")
    expect(normalized.order).not.toContain("imports")
    expect(normalized.hidden).toEqual(["transactions"])
    expect(normalized.removed).toEqual(["imports"])
    expect(normalized.order).toContain("netWorth")
  })

  it("moves and drag-reorders modules without losing state", () => {
    const moved = moveDashboardModule(defaultDashboardCustomization, "filters", -1)
    expect(moved.order.slice(0, 2)).toEqual(["filters", "metrics"])

    const reordered = reorderDashboardModules(moved, "netWorth", "filters")
    expect(reordered.order[0]).toBe("netWorth")
    expect(reordered.order).toHaveLength(defaultDashboardCustomization.order.length)
  })

  it("hides, shows, removes, and restores modules", () => {
    const hidden = setDashboardModuleVisibility(defaultDashboardCustomization, "netWorth", false)
    expect(hidden.hidden).toContain("netWorth")
    expect(setDashboardModuleVisibility(hidden, "netWorth", true).hidden).not.toContain("netWorth")

    const removed = removeDashboardModule(hidden, "netWorth")
    expect(removed.order).not.toContain("netWorth")
    expect(removed.removed).toContain("netWorth")

    const restored = addDashboardModule(removed, "netWorth")
    expect(restored.order.at(-1)).toBe("netWorth")
    expect(restored.removed).not.toContain("netWorth")
    expect(restored.hidden).not.toContain("netWorth")
  })
})
