// Home-screen quick actions bridge (iOS UIApplicationShortcutItems).
//
// Native counterpart: scripts/ios-patcher.mjs writes two static shortcut
// items (see QUICK_ACTION_ADD_TYPE / QUICK_ACTION_BUDGETS_TYPE) into the
// generated Info.plist plus a SceneDelegate handler. The handler forwards the
// tapped item's type string through the Capacitor bridge, which dispatches
// `window.dispatchEvent(new CustomEvent(QUICK_ACTION_EVENT,
// { detail: <type> }))`. This module maps that type to an in-app destination
// using the existing router (src/app/router.tsx — route paths only; the
// router itself is untouched).
//
// Destination notes: "Add transaction" deep-links to /transactions, the page
// hosting the Add dialog. Auto-opening the dialog would need a URL-param
// contract in the transactions feature (another zone this round), so it stays
// a documented follow-up; "View budgets" deep-links to /budgets. Unknown
// action types are ignored. Device tap-through is out of scope for this
// change (see the docs decision log); these pure parts are unit-tested.

import { router } from "@/app/router"

/** Static shortcut item type for "Add transaction" (see ios-patcher). */
export const QUICK_ACTION_ADD_TYPE = "com.budgetlens.add"

/** Static shortcut item type for "View budgets" (see ios-patcher). */
export const QUICK_ACTION_BUDGETS_TYPE = "com.budgetlens.budgets"

/** Window CustomEvent name carrying the shortcut type in `detail`. */
export const QUICK_ACTION_EVENT = "budgetlens-quick-action"

export type QuickActionDestination = "/transactions" | "/budgets"

/**
 * Map a shortcut type string to its in-app destination. Returns null for
 * unknown types so callers ignore them.
 */
export function destinationForQuickAction(actionType: string): QuickActionDestination | null {
  switch (actionType) {
    case QUICK_ACTION_ADD_TYPE:
      return "/transactions"
    case QUICK_ACTION_BUDGETS_TYPE:
      return "/budgets"
    default:
      return null
  }
}

/**
 * Extract the action type from a bridge CustomEvent. Returns null when the
 * event carries no string detail (malformed payloads are ignored).
 */
export function actionTypeFromEvent(event: Event): string | null {
  if ("detail" in event && typeof event.detail === "string" && event.detail.length > 0) {
    return event.detail
  }
  return null
}

/**
 * Register the window listener that routes quick-action taps via the app
 * router. Returns an unsubscribe function. Mounting (one call at startup) is
 * a follow-up alongside device validation so no app-shell files change here.
 */
export function setupQuickActionListener(): () => void {
  const handler = (event: Event) => {
    const actionType = actionTypeFromEvent(event)
    if (actionType === null) return
    const destination = destinationForQuickAction(actionType)
    if (destination === null) return
    void router.navigate({ to: destination })
  }
  window.addEventListener(QUICK_ACTION_EVENT, handler)
  return () => window.removeEventListener(QUICK_ACTION_EVENT, handler)
}
