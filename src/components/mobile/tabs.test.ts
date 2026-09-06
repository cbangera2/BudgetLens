import { allMobileRoutes, MOBILE_MORE_TAB_ROUTES, splitNavigation } from "./tabs"

const navigation = [
  { to: "/", label: "Overview" },
  { to: "/net-worth", label: "Net worth" },
  { to: "/transactions", label: "Transactions" },
  { to: "/groups", label: "Groups" },
  { to: "/budgets", label: "Budgets" },
  { to: "/imports", label: "Imports" },
  { to: "/settings", label: "Settings" },
] as const

describe("mobile tab membership", () => {
  it("shows five primary tabs with Groups and Imports in the More sheet", () => {
    const { primary, more } = splitNavigation(navigation)
    // Input order is preserved (app order), not the constant order.
    expect(primary.map((item) => item.to)).toEqual([
      "/",
      "/net-worth",
      "/transactions",
      "/budgets",
      "/settings",
    ])
    expect(primary).toHaveLength(5)
    expect(more.map((item) => item.to)).toEqual([...MOBILE_MORE_TAB_ROUTES])
    expect(more.map((item) => item.label)).toEqual(["Groups", "Imports"])
  })

  it("keeps all seven destinations reachable exactly once, in order", () => {
    const { primary, more } = splitNavigation(navigation)
    const reached = [...primary, ...more].map((item) => item.to)
    expect(reached.toSorted()).toEqual(navigation.map((item) => item.to).toSorted())
    expect(new Set(reached).size).toBe(navigation.length)
    // Input order is preserved within each group.
    expect(primary.map((item) => item.to)).toEqual(
      navigation.map((item) => item.to).filter((to) => primary.some((item) => item.to === to)),
    )
  })

  it("falls through unknown routes to More so they stay reachable", () => {
    const extended = [...navigation, { to: "/groups/$groupId", label: "Group detail" }] as const
    const { primary, more } = splitNavigation(extended)
    expect(primary).toHaveLength(5)
    expect(more.map((item) => item.to)).toContain("/groups/$groupId")
  })

  it("exposes the full reachable route set", () => {
    expect(allMobileRoutes()).toHaveLength(7)
    expect(new Set(allMobileRoutes()).size).toBe(7)
  })
})
