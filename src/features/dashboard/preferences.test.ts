import {
  defaultDashboardPreferences,
  moveWidget,
  normalizeDashboardPreferences,
  toggleWidget,
} from "./preferences"

describe("dashboard preferences", () => {
  it("repairs unknown, duplicated, and missing widget identifiers", () => {
    expect(
      normalizeDashboardPreferences({
        order: ["recent", "recent", "unknown"],
        hidden: ["cashFlow", "bad"],
      }),
    ).toEqual({
      order: ["recent", "cashFlow", "categories", "budgets"],
      hidden: ["cashFlow"],
    })
  })

  it("moves widgets only inside the constrained order", () => {
    expect(moveWidget(defaultDashboardPreferences, "categories", -1).order).toEqual([
      "categories",
      "cashFlow",
      "budgets",
      "recent",
    ])
    expect(moveWidget(defaultDashboardPreferences, "cashFlow", -1)).toBe(
      defaultDashboardPreferences,
    )
  })

  it("toggles widget visibility", () => {
    const hidden = toggleWidget(defaultDashboardPreferences, "recent")
    expect(hidden.hidden).toEqual(["recent"])
    expect(toggleWidget(hidden, "recent").hidden).toEqual([])
  })
})
