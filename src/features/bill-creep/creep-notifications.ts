// Bill-creep local-notification hookup.
//
// Calls the existing notification stack instead of reimplementing it: the
// reminder shape and money formatting come from the notification engine, the
// toggle + fired-key persistence from its preferences module, and delivery
// from the native bridge the scheduler uses. This module's own logic is only
// the creep trigger set and its reconciliation.
//
// Key-space note: creep keys use the "creep:" prefix so the budget/bill
// scheduler (which owns "budget:"/"bill:") treats them as foreign and never
// cancels them, and vice versa. Dismissed creeps never schedule.
//
// Same degradation contract as the scheduler: web is a console-debug no-op,
// denied/disabled/empty paths resolve a status, and nothing here ever throws.

import { liveQuery } from "dexie"

import { repositories } from "@/db/repositories"
import type { Transaction } from "@/domain/models"
import { formatMinorAsMoney, type PendingReminder } from "@/features/notifications/engine"
import {
  readFiredKeys,
  readNotificationsEnabled,
  writeFiredKeys,
} from "@/features/notifications/preferences"
import type { ReminderSyncStatus } from "@/features/notifications/scheduler"
import {
  cancelReminderNotifications,
  checkReminderPermission,
  isNative,
  listPendingReminderKeys,
  reminderNumericId,
  scheduleReminderNotifications,
} from "@/lib/native"

import { type BillCreep, detectBillCreep } from "./creep"
import { loadDismissedCreepKeys } from "./dismissals"

/** Stable dedupe key for a creep, e.g. "creep:acme streaming:2026-04-15". */
export function creepReminderKey(creep: Pick<BillCreep, "key" | "latestDate">): string {
  return `creep:${creep.key}:${creep.latestDate}`
}

function isCreepKey(key: string | null): key is string {
  return key !== null && key.startsWith("creep:")
}

/** One local-notification trigger per creep. Pure. */
export function toCreepReminder(creep: BillCreep): PendingReminder {
  return {
    key: creepReminderKey(creep),
    kind: "bill",
    title: `${creep.displayName} costs more`,
    body: `${creep.displayName} rose from ${formatMinorAsMoney(creep.baselineMinor)} to ${formatMinorAsMoney(creep.latestMinor)} (+${creep.deltaPct}%, +${formatMinorAsMoney(creep.deltaMinor)}).`,
  }
}

/** Every creep trigger for the snapshot, minus dismissed merchants. Pure. */
export function computeCreepReminders(
  transactions: readonly Transaction[],
  dismissedKeys?: ReadonlySet<string>,
): PendingReminder[] {
  const reminders =
    dismissedKeys === undefined
      ? detectBillCreep(transactions).map(toCreepReminder)
      : detectBillCreep(transactions, { dismissedKeys }).map(toCreepReminder)
  reminders.sort((left, right) => left.key.localeCompare(right.key))
  return reminders
}

/** Injectable seams for unit tests; productionCreepAdapter() wires the real ones. */
export interface CreepSyncAdapter {
  isNativeShell: boolean
  enabled: boolean
  firedKeys: string[]
  checkPermission: () => Promise<string>
  listPending: () => Promise<{ id: number; key: string | null }[]>
  schedule: (reminders: readonly PendingReminder[]) => Promise<void>
  cancel: (ids?: readonly number[]) => Promise<void>
  persistFiredKeys: (fresh: readonly string[]) => void
}

export interface CreepSyncResult {
  status: ReminderSyncStatus
  scheduled: PendingReminder[]
  cancelled: number[]
}

function emptyResult(status: ReminderSyncStatus): CreepSyncResult {
  return { status, scheduled: [], cancelled: [] }
}

/** Production adapter: native bridge + localStorage prefs. Never throws on build. */
export function productionCreepAdapter(): CreepSyncAdapter {
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
 * Reconcile creep triggers with pending notifications. Serialized
 * process-wide so overlapping runs cannot reorder native ops. Never throws.
 */
export async function syncCreepReminders(
  transactions: readonly Transaction[],
  adapter: CreepSyncAdapter,
): Promise<CreepSyncResult> {
  const run = creepSyncChain.then(() => reconcileCreepReminders(transactions, adapter))
  creepSyncChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

let creepSyncChain: Promise<void> = Promise.resolve()

async function reconcileCreepReminders(
  transactions: readonly Transaction[],
  adapter: CreepSyncAdapter,
): Promise<CreepSyncResult> {
  try {
    if (!adapter.isNativeShell) {
      console.debug("[notifications] skipping creep sync on web (native-only)")
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

    let dismissed: ReadonlySet<string>
    try {
      dismissed = loadDismissedCreepKeys()
    } catch {
      dismissed = new Set()
    }
    // Actionable WITHOUT the fired-key filter: a reminder scheduled by the
    // previous run is fired AND still pending, and must stay desired or it
    // would be misclassified as stale and cancelled.
    const actionable = computeCreepReminders(transactions, dismissed)
    const actionableKeys = new Set(actionable.map((reminder) => reminder.key))
    const pendingIds = new Set(pending.map((entry) => entry.id))
    const stale = pending
      .filter((entry) => isCreepKey(entry.key) && !actionableKeys.has(entry.key))
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

/**
 * Production entry point for data-change hooks: reload the store and
 * reconcile creep reminders. Best-effort; never throws.
 */
export async function refreshCreepReminders(): Promise<ReminderSyncStatus> {
  try {
    const transactions = await repositories.transactions.list()
    const result = await syncCreepReminders(transactions, productionCreepAdapter())
    return result.status
  } catch {
    return "skipped-error"
  }
}

let creepStoreSyncStop: (() => void) | null = null

/**
 * Debounced liveQuery subscription over the transactions table so any commit
 * re-reconciles creep reminders. Idempotent: repeated calls reuse the active
 * subscription. Call the returned stop only in tests. Never throws.
 */
export function ensureCreepStoreSync(): () => void {
  try {
    if (creepStoreSyncStop) return creepStoreSyncStop
    if (typeof window === "undefined") return () => undefined
    let timer: ReturnType<typeof setTimeout> | null = null
    const subscription = liveQuery(() => repositories.transactions.list()).subscribe({
      next: () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void refreshCreepReminders().catch(() => undefined)
        }, 500)
      },
      error: () => undefined,
    })
    creepStoreSyncStop = () => {
      if (timer) clearTimeout(timer)
      timer = null
      try {
        subscription.unsubscribe()
      } catch {
        // Ignore.
      }
      creepStoreSyncStop = null
    }
    return creepStoreSyncStop
  } catch {
    return () => undefined
  }
}

/** Test-only reset for the store-sync singleton. */
export function resetCreepStoreSyncForTests(): void {
  try {
    creepStoreSyncStop?.()
  } catch {
    // Ignore.
  }
  creepStoreSyncStop = null
}
