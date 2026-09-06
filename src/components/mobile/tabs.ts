/**
 * Mobile tab-bar membership.
 *
 * The desktop sidebar lists all seven destinations; a bottom tab bar cannot
 * fit seven comfortably, so small viewports show five primary tabs plus a
 * "More" button that opens a bottom sheet with the remaining two. Every
 * destination stays exactly one tap away.
 *
 * Membership is expressed as route paths so `app-shell.tsx` keeps owning the
 * labels/icons (single source of truth) and this module only splits them.
 * The five daily-glance destinations stay visible because the cross-width
 * browser suite deep-links them; Groups + Imports (management surfaces)
 * live in the overflow sheet.
 */

export const MOBILE_PRIMARY_TAB_ROUTES = [
  "/",
  "/transactions",
  "/budgets",
  "/net-worth",
  "/settings",
] as const

export const MOBILE_MORE_TAB_ROUTES = ["/groups", "/imports"] as const

export type MobilePrimaryTabRoute = (typeof MOBILE_PRIMARY_TAB_ROUTES)[number]
export type MobileMoreTabRoute = (typeof MOBILE_MORE_TAB_ROUTES)[number]

export interface MobileTabSplit<T extends { to: string }> {
  primary: T[]
  more: T[]
}

/**
 * Split a navigation array into visible tabs and overflow-sheet entries.
 * Order follows the input array; unknown routes fall through to `more` so
 * they stay reachable rather than silently dropping off the tab bar.
 */
export function splitNavigation<T extends { to: string }>(
  navigation: readonly T[],
): MobileTabSplit<T> {
  const primarySet = new Set<string>(MOBILE_PRIMARY_TAB_ROUTES)
  const primary: T[] = []
  const more: T[] = []
  for (const item of navigation) {
    if (primarySet.has(item.to)) primary.push(item)
    else more.push(item)
  }
  return { primary, more }
}

/** Every route reachable through the mobile shell (tabs + More sheet). */
export function allMobileRoutes(): string[] {
  return [...MOBILE_PRIMARY_TAB_ROUTES, ...MOBILE_MORE_TAB_ROUTES]
}
