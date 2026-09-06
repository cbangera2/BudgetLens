// Reminder scheduling layer: turns engine triggers into local notifications.
//
// Flow: read budgets + transactions from the local Dexie store, derive due
// triggers with the pure engine, reconcile against pending notifications
// (cancel stale ones, skip already-pending/fired ones), and schedule the rest
// via the native bridge. Web is a console-debug no-op; permission-denied and
// unsupported paths degrade silently with a status the UI explains.
//
// Data-change coverage: refreshReminders() reads the same Dexie tables every
// mutation point writes through (import commit, restore, transaction/budget
// edits), and ensureReminderStoreSync() keeps a debounced liveQuery
// subscription so any commit re-syncs without touching sibling features.

import { liveQuery } from "dexie"

import { repositories } from "@/db/repositories"
import type { BudgetGoal, Transaction } from "@/domain/models"
import { computePendingReminders, type PendingReminder } from "@/features/notifications/engine"
import {
  readFiredKeys,
  readNotificationsEnabled,
  writeFiredKeys,
  writeNotificationsEnabled,
} from "@/features/notifications/preferences"
import {
  cancelReminderNotifications,
  checkReminderPermission,
  isNative,
  listPendingReminderKeys,
  reminderNumericId,
  requestReminderPermission,
  scheduleReminderNotifications,
} from "@/lib/native"

export type ReminderSyncStatus =
  | "synced"
  | "skipped-web"
  | "skipped-disabled"
  | "skipped-denied"
  | "skipped-empty"
  | "cancelled"
  | "skipped-error"

export interface ReminderSyncInput {
  budgets: readonly BudgetGoal[]
  transactions: readonly Transaction[]
  todayIso: string
}

/** Injectable seams for unit tests; productionReminderAdapter() wires the real ones. */
export interface ReminderSyncAdapter {
  isNativeShell: boolean
  enabled: boolean
  firedKeys: string[]
  checkPermission: () => Promise<string>
  listPending: () => Promise<{ id: number; key: string | null }[]>
  schedule: (reminders: readonly PendingReminder[]) => Promise<void>
  cancel: (ids?: readonly number[]) => Promise<void>
  persistFiredKeys: (fresh: readonly string[]) => void
}

export interface ReminderSyncResult {
  status: ReminderSyncStatus
  scheduled: PendingReminder[]
  cancelled: number[]
}

function emptyResult(status: ReminderSyncStatus): ReminderSyncResult {
  return { status, scheduled: [], cancelled: [] }
}

function isOurKey(key: string | null): key is string {
  return key !== null && (key.startsWith("budget:") || key.startsWith("bill:"))
}

/** Production adapter: native bridge + localStorage prefs. Never throws on build. */
export function productionReminderAdapter(): ReminderSyncAdapter {
  const storage = window.localStorage
  return {
    isNativeShell: isNative(),
    enabled: readNotificationsEnabled(storage),
    firedKeys: readFiredKeys(storage),
    checkPermission: () => checkReminderPermission(),
    listPending: () => listPendingReminderKeys(),
    schedule: (reminders) => scheduleReminderNotifications(reminders),
    cancel: (ids) => cancelReminderNotifications(ids),
    persistFiredKeys: (fresh) => writeFiredKeys(storage, readFiredKeys(storage), fresh),
  }
}

/**
 * Reconcile desired triggers with pending notifications. Serialized
 * process-wide: concurrent data-change callbacks queue behind the active run
 * so an older snapshot can never schedule or cancel after a newer one.
 * Never throws: every failure degrades to a status the UI can explain.
 */
export async function syncReminders(
  input: ReminderSyncInput,
  adapter: ReminderSyncAdapter,
): Promise<ReminderSyncResult> {
  const run = syncChain.then(() => reconcileReminders(input, adapter))
  syncChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

let syncChain: Promise<void> = Promise.resolve()

async function reconcileReminders(
  input: ReminderSyncInput,
  adapter: ReminderSyncAdapter,
): Promise<ReminderSyncResult> {
  try {
    if (!adapter.isNativeShell) {
      console.debug("[notifications] skipping reminder sync on web (native-only)")
      return emptyResult("skipped-web")
    }
    if (!adapter.enabled) return emptyResult("skipped-disabled")

    let permission: string
    try {
      permission = await adapter.checkPermission()
    } catch {
      return emptyResult("skipped-denied")
    }
    if (permission !== "granted") return emptyResult("skipped-denied")

    let pending: { id: number; key: string | null }[]
    try {
      pending = await adapter.listPending()
    } catch {
      return emptyResult("skipped-error")
    }

    // Actionable triggers WITHOUT the fired-key filter: a reminder scheduled
    // by the previous run is fired AND still pending, and must stay in the
    // desired set or it would be misclassified as stale and cancelled.
    const actionable = computePendingReminders({
      budgets: input.budgets,
      transactions: input.transactions,
      todayIso: input.todayIso,
    })
    const actionableKeys = new Set(actionable.map((reminder) => reminder.key))
    const pendingIds = new Set(pending.map((entry) => entry.id))
    const stale = pending
      .filter((entry) => isOurKey(entry.key) && !actionableKeys.has(entry.key))
      .map((entry) => entry.id)
    const fired = new Set(adapter.firedKeys)
    const fresh = actionable.filter(
      (reminder) => !fired.has(reminder.key) && !pendingIds.has(reminderNumericId(reminder.key)),
    )

    if (actionable.length === 0) {
      if (stale.length > 0) {
        try {
          await adapter.cancel(stale)
        } catch {
          return emptyResult("skipped-error")
        }
        return { status: "skipped-empty", scheduled: [], cancelled: stale }
      }
      return emptyResult("skipped-empty")
    }

    try {
      if (stale.length > 0) await adapter.cancel(stale)
      if (fresh.length > 0) await adapter.schedule(fresh)
    } catch {
      return emptyResult("skipped-error")
    }
    if (fresh.length > 0) {
      try {
        adapter.persistFiredKeys(fresh.map((reminder) => reminder.key))
      } catch {
        // Fired-key persistence is advisory; scheduling already succeeded.
      }
    }
    return { status: "synced", scheduled: fresh, cancelled: stale }
  } catch {
    return emptyResult("skipped-error")
  }
}

function localTodayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Production entry point for every data-change hook (import commit, restore,
 * transaction/budget edits): reload the store and reconcile reminders.
 * Best-effort; never throws.
 */
export async function refreshReminders(
  todayIso: string = localTodayIso(),
): Promise<ReminderSyncStatus> {
  try {
    const [budgets, transactions] = await Promise.all([
      repositories.budgets.list(),
      repositories.transactions.list(),
    ])
    const result = await syncReminders(
      { budgets, transactions, todayIso },
      productionReminderAdapter(),
    )
    return result.status
  } catch {
    return "skipped-error"
  }
}

export type EnableRemindersOutcome =
  | { enabled: true; status: ReminderSyncStatus }
  | { enabled: false; reason: "unsupported" | "denied" | "disabled" | "error" }

/**
 * Enable/disable path for the Settings toggle. Permission is requested ONLY
 * when enabling (notifications are interruptive). Disabling persists OFF and
 * cancels every pending reminder. Never throws.
 */
export async function setRemindersEnabled(next: boolean): Promise<EnableRemindersOutcome> {
  try {
    if (!isNative()) {
      if (next) return { enabled: false, reason: "unsupported" }
      try {
        writeNotificationsEnabled(window.localStorage, false)
      } catch {
        // Ignore.
      }
      return { enabled: false, reason: "unsupported" }
    }
    if (!next) {
      try {
        writeNotificationsEnabled(window.localStorage, false)
      } catch {
        // Ignore.
      }
      try {
        await cancelReminderNotifications()
      } catch {
        return { enabled: false, reason: "error" }
      }
      return { enabled: false, reason: "disabled" }
    }
    let permission: string
    try {
      permission = await requestReminderPermission()
    } catch {
      return { enabled: false, reason: "error" }
    }
    if (permission !== "granted") {
      try {
        writeNotificationsEnabled(window.localStorage, false)
      } catch {
        // Ignore.
      }
      return { enabled: false, reason: "denied" }
    }
    try {
      writeNotificationsEnabled(window.localStorage, true)
    } catch {
      // Ignore.
    }
    // The refresh must see the enabled preference; on failure revert it so
    // the toggle never claims an active state that never scheduled.
    const status = await refreshReminders()
    if (status === "skipped-error") {
      try {
        writeNotificationsEnabled(window.localStorage, false)
      } catch {
        // Ignore.
      }
      return { enabled: false, reason: "error" }
    }
    return { enabled: true, status }
  } catch {
    return { enabled: false, reason: "error" }
  }
}

let storeSyncStop: (() => void) | null = null

/**
 * Debounced liveQuery subscription over the budgets + transactions tables so
 * any commit (import, restore, edits) re-reconciles reminders. Idempotent:
 * repeated calls reuse the active subscription. The subscription survives
 * navigation for the rest of the session; call the returned stop only in
 * tests. Never throws.
 */
export function ensureReminderStoreSync(): () => void {
  try {
    if (storeSyncStop) return storeSyncStop
    if (typeof window === "undefined") return () => undefined
    let timer: ReturnType<typeof setTimeout> | null = null
    const subscription = liveQuery(() =>
      Promise.all([repositories.budgets.list(), repositories.transactions.list()]),
    ).subscribe({
      next: () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void refreshReminders().catch(() => undefined)
        }, 500)
      },
      error: () => undefined,
    })
    storeSyncStop = () => {
      if (timer) clearTimeout(timer)
      timer = null
      try {
        subscription.unsubscribe()
      } catch {
        // Ignore.
      }
      storeSyncStop = null
    }
    return storeSyncStop
  } catch {
    return () => undefined
  }
}

/** Test-only reset for the store-sync singleton. */
export function resetReminderStoreSyncForTests(): void {
  try {
    storeSyncStop?.()
  } catch {
    // Ignore.
  }
  storeSyncStop = null
}
