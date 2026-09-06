import type { BudgetLensRepositories } from "@/domain/repositories"
import type { FinanceSnapshot } from "@/features/assistant/data-tools"
import { buildFinanceSnapshot } from "@/features/assistant/data-tools"
import { writeWidgetSnapshot, type WidgetSnapshotWriteResult } from "@/lib/native"

import { buildWidgetSnapshot, serializeWidgetSnapshot } from "./snapshot"

/**
 * One-line widget refresh hooks for every meaningful data change.
 *
 * Ownership note: the mutation call sites (import commit, backup restore,
 * transaction add/edit/delete, budget save/delete) live in other features and
 * are intentionally NOT touched by this change. Each site wires a single
 * `void notifyXxxChanged(repositories)` call; the exact insertion points are
 * listed on each helper below so owning agents (or a follow-up) can land them
 * without conflicts. Everything here is best-effort and never throws, so a
 * widget failure can never break the finance flow that triggered it.
 */

export interface WidgetRefreshHooks {
  buildSnapshot?: (repositories: BudgetLensRepositories) => Promise<FinanceSnapshot>
  sink?: (json: string) => Promise<WidgetSnapshotWriteResult>
}

const defaultHooks: Required<WidgetRefreshHooks> = {
  buildSnapshot: (repositories) => buildFinanceSnapshot(repositories),
  sink: (json) => writeWidgetSnapshot(json),
}

/**
 * Rebuild the finance snapshot, shrink it to the widget payload, and hand it
 * to the native bridge sink. Never throws: failures resolve to a noop result.
 */
export async function refreshWidgetSnapshot(
  repositories: BudgetLensRepositories,
  now: Date = new Date(),
  hooks: WidgetRefreshHooks = {},
): Promise<WidgetSnapshotWriteResult> {
  const buildSnapshot = hooks.buildSnapshot ?? defaultHooks.buildSnapshot
  const sink = hooks.sink ?? defaultHooks.sink
  try {
    const finance = await buildSnapshot(repositories)
    return await sink(serializeWidgetSnapshot(buildWidgetSnapshot(finance, { now })))
  } catch (error) {
    return {
      ok: false,
      via: "noop",
      reason: error instanceof Error ? error.message : "widget-refresh-failed",
    }
  }
}

/**
 * Call after `ImportService.commit` / `commitMany` resolves.
 * (Wiring point: `src/features/imports/import-page.tsx` commit handlers.)
 */
export function notifyImportCommitted(
  repositories: BudgetLensRepositories,
  now?: Date,
  hooks?: WidgetRefreshHooks,
): Promise<WidgetSnapshotWriteResult> {
  return refreshWidgetSnapshot(repositories, now ?? new Date(), hooks ?? {})
}

/**
 * Call after `restoreBackup` resolves.
 * (Wiring point: `src/features/settings/settings-page.tsx` applyRestore.)
 */
export function notifyRestoreCompleted(
  repositories: BudgetLensRepositories,
  now?: Date,
  hooks?: WidgetRefreshHooks,
): Promise<WidgetSnapshotWriteResult> {
  return refreshWidgetSnapshot(repositories, now ?? new Date(), hooks ?? {})
}

/**
 * Call after transaction add / edit / bulk-edit / delete.
 * (Wiring points: `src/features/transactions/transactions-page.tsx` save,
 * bulkApply, toggleSharedSingle, and the delete confirmation.)
 */
export function notifyTransactionsChanged(
  repositories: BudgetLensRepositories,
  now?: Date,
  hooks?: WidgetRefreshHooks,
): Promise<WidgetSnapshotWriteResult> {
  return refreshWidgetSnapshot(repositories, now ?? new Date(), hooks ?? {})
}

/**
 * Call after budget goal save / delete.
 * (Wiring points: `src/features/budgets/budgets-page.tsx` submit + remove.)
 */
export function notifyBudgetsChanged(
  repositories: BudgetLensRepositories,
  now?: Date,
  hooks?: WidgetRefreshHooks,
): Promise<WidgetSnapshotWriteResult> {
  return refreshWidgetSnapshot(repositories, now ?? new Date(), hooks ?? {})
}

// Coalescing scheduler for burst writes (e.g. a 20-file import commit or a
// restore touching every table). Trailing-edge debounce: rapid successive
// calls collapse into ONE snapshot build + sink write, and every caller
// resolves with that single result.

interface ScheduledRefresh {
  repositories: BudgetLensRepositories
  now: Date
  hooks: WidgetRefreshHooks
}

let scheduledTimer: ReturnType<typeof setTimeout> | null = null
let scheduledRefresh: ScheduledRefresh | null = null
const scheduledWaiters: Array<(result: WidgetSnapshotWriteResult) => void> = []

function flushScheduledRefresh(): void {
  const current = scheduledRefresh
  const waiters = scheduledWaiters.splice(0, scheduledWaiters.length)
  scheduledRefresh = null
  scheduledTimer = null
  if (!current) return
  void refreshWidgetSnapshot(current.repositories, current.now, current.hooks).then((result) => {
    for (const resolve of waiters) resolve(result)
  })
}

/**
 * Schedule a coalesced refresh. Returns a promise for the shared result.
 * Never throws; use {@link cancelScheduledWidgetRefresh} in tests/teardown.
 */
export function scheduleWidgetRefresh(
  repositories: BudgetLensRepositories,
  options: { delayMs?: number; now?: Date; hooks?: WidgetRefreshHooks } = {},
): Promise<WidgetSnapshotWriteResult> {
  const delayMs = options.delayMs ?? 500
  scheduledRefresh = {
    repositories,
    now: options.now ?? new Date(),
    hooks: options.hooks ?? {},
  }
  const promise = new Promise<WidgetSnapshotWriteResult>((resolve) => {
    scheduledWaiters.push(resolve)
  })
  if (scheduledTimer) clearTimeout(scheduledTimer)
  scheduledTimer = setTimeout(flushScheduledRefresh, delayMs)
  return promise
}

/** Drop a pending scheduled refresh; waiters resolve to a cancelled result. */
export function cancelScheduledWidgetRefresh(): void {
  if (scheduledTimer) clearTimeout(scheduledTimer)
  scheduledTimer = null
  scheduledRefresh = null
  const waiters = scheduledWaiters.splice(0, scheduledWaiters.length)
  for (const resolve of waiters) resolve({ ok: false, via: "noop", reason: "cancelled" })
}
