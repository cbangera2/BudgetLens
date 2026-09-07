// Bridge from the command palette to the assistant panel. The panel owns its
// own state (untouched here); the shell opens it on this event and the
// palette best-effort prefills the composer via its stable aria-label.

import { ASSISTANT_OPEN_KEY } from "@/features/assistant/provider"

/** Window CustomEvent name carrying the preset question in `detail`. */
export const ASSISTANT_OPEN_EVENT = "budgetlens:open-assistant"

/** sessionStorage key for the pending preset question (per-tab, transient). */
export const ASSISTANT_PENDING_QUESTION_KEY = "budgetlens.assistant.pending-question.v1"

const COMPOSER_LABEL = "Ask the assistant"

function safeSession(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Ask the shell to open the assistant with a preset question. */
export function requestAssistantWithQuestion(question: string): void {
  try {
    safeSession()?.setItem(ASSISTANT_PENDING_QUESTION_KEY, question)
  } catch {
    // Pending-question handoff is best-effort; the open event below still fires.
  }
  try {
    window.localStorage.setItem(ASSISTANT_OPEN_KEY, "open")
  } catch {
    // Open state falls back to the dispatched event below.
  }
  window.dispatchEvent(new CustomEvent<string>(ASSISTANT_OPEN_EVENT, { detail: question }))
}

/** Read and clear the pending preset question, if any. */
export function takePendingAssistantQuestion(
  session?: Pick<Storage, "getItem" | "removeItem">,
): string | null {
  const store = session ?? safeSession()
  if (!store) return null
  try {
    const value = store.getItem(ASSISTANT_PENDING_QUESTION_KEY)
    store.removeItem(ASSISTANT_PENDING_QUESTION_KEY)
    return typeof value === "string" && value.length > 0 ? value : null
  } catch {
    return null
  }
}

/**
 * Best-effort prefill of the assistant composer (React-controlled textarea):
 * set through the native setter so React observes the change, then focus.
 * Returns false when the composer is not mounted yet (caller may retry).
 */
export function prefillAssistantComposer(question: string): boolean {
  try {
    const area = document.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${COMPOSER_LABEL}"]`,
    )
    if (!area) return false
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )
    // oxlint-disable-next-line typescript/unbound-method -- The native setter must run with the element as receiver to bypass React's value tracker.
    const setter = descriptor?.set
    if (typeof setter !== "function") return false
    Reflect.apply(setter, area, [question])
    area.dispatchEvent(new Event("input", { bubbles: true }))
    area.focus()
    return true
  } catch {
    return false
  }
}

/** Retry the prefill until the panel mounts (up to ~1.2s), then give up. */
export function prefillAssistantComposerSoon(question: string): void {
  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    if (prefillAssistantComposer(question) || attempts >= 12) window.clearInterval(timer)
  }, 100)
}
