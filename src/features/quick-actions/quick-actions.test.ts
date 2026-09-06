import { afterEach, describe, expect, it, vi } from "vitest"

import {
  QUICK_ACTION_ADD_TYPE,
  QUICK_ACTION_BUDGETS_TYPE,
  QUICK_ACTION_EVENT,
  actionTypeFromEvent,
  destinationForQuickAction,
  setupQuickActionListener,
} from "@/features/quick-actions/quick-actions"

vi.mock("@/app/router", () => ({
  router: { navigate: vi.fn<(options: { to: string }) => Promise<void>>(async () => undefined) },
}))

import { router } from "@/app/router"

const navigate = vi.mocked(router.navigate)

afterEach(() => {
  vi.clearAllMocks()
})

function dispatchQuickAction(detail: unknown): void {
  window.dispatchEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail }))
}

describe("destinationForQuickAction", () => {
  it("routes the add-transaction shortcut to the transactions page", () => {
    expect(destinationForQuickAction(QUICK_ACTION_ADD_TYPE)).toBe("/transactions")
  })

  it("routes the budgets shortcut to the budgets page", () => {
    expect(destinationForQuickAction(QUICK_ACTION_BUDGETS_TYPE)).toBe("/budgets")
  })

  it("ignores unknown action types", () => {
    expect(destinationForQuickAction("com.budgetlens.unknown")).toBeNull()
    expect(destinationForQuickAction("")).toBeNull()
    expect(destinationForQuickAction("com.apple.shortcut")).toBeNull()
  })
})

describe("actionTypeFromEvent", () => {
  it("reads the string detail from the bridge CustomEvent", () => {
    expect(
      actionTypeFromEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail: QUICK_ACTION_ADD_TYPE })),
    ).toBe(QUICK_ACTION_ADD_TYPE)
  })

  it("rejects missing, empty, and non-string details", () => {
    expect(actionTypeFromEvent(new CustomEvent(QUICK_ACTION_EVENT))).toBeNull()
    expect(actionTypeFromEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail: "" }))).toBeNull()
    expect(actionTypeFromEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail: 42 }))).toBeNull()
    expect(
      actionTypeFromEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail: { type: "x" } })),
    ).toBeNull()
    expect(actionTypeFromEvent(new Event(QUICK_ACTION_EVENT))).toBeNull()
  })
})

describe("setupQuickActionListener", () => {
  it("navigates to the transactions page for the add shortcut", () => {
    const unsubscribe = setupQuickActionListener()
    try {
      dispatchQuickAction(QUICK_ACTION_ADD_TYPE)
      expect(navigate).toHaveBeenCalledTimes(1)
      expect(navigate).toHaveBeenCalledWith({ to: "/transactions" })
    } finally {
      unsubscribe()
    }
  })

  it("navigates to the budgets page for the budgets shortcut", () => {
    const unsubscribe = setupQuickActionListener()
    try {
      dispatchQuickAction(QUICK_ACTION_BUDGETS_TYPE)
      expect(navigate).toHaveBeenCalledWith({ to: "/budgets" })
    } finally {
      unsubscribe()
    }
  })

  it("ignores unknown types and malformed payloads", () => {
    const unsubscribe = setupQuickActionListener()
    try {
      dispatchQuickAction("com.budgetlens.unknown")
      dispatchQuickAction("")
      dispatchQuickAction(42)
      dispatchQuickAction(null)
      expect(navigate).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it("stops routing after unsubscribe", () => {
    const unsubscribe = setupQuickActionListener()
    unsubscribe()
    dispatchQuickAction(QUICK_ACTION_ADD_TYPE)
    expect(navigate).not.toHaveBeenCalled()
  })
})
