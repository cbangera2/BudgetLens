// Bill-creep list UI: recurring charges that rose above their usual amount.
//
// New file owned by the bill-creep feature. Reads the Dexie transaction store
// like the sibling sections (or takes injected transactions in tests) and
// filters with the versioned dismissal store. Each row shows the merchant,
// old-to-new amounts, percent + dollar deltas, and the first-seen date.

import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"
import type { Transaction } from "@/domain/models"

import { type BillCreep, detectBillCreep } from "./creep"
import { ensureCreepStoreSync } from "./creep-notifications"
import { dismissCreepKey, loadDismissedCreepKeys, restoreCreepKey } from "./dismissals"

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    amountMinor / 100,
  )
}

function CreepRow({ creep, onDismiss }: { creep: BillCreep; onDismiss: (key: string) => void }) {
  return (
    <li key={creep.key} className="flex items-center justify-between gap-4 py-3 text-sm">
      <span>
        <span className="block font-medium">{creep.displayName}</span>
        <span className="text-xs text-muted-foreground">
          {formatMoney(creep.baselineMinor)} → {formatMoney(creep.latestMinor)} · +{creep.deltaPct}%
          (+{formatMoney(creep.deltaMinor)}) · since {creep.firstSeenDate}
        </span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Dismiss ${creep.displayName} bill creep`}
        onClick={() => onDismiss(creep.key)}
      >
        Dismiss
      </Button>
    </li>
  )
}

export function BillCreepSection({
  transactions: injectedTransactions,
}: {
  transactions?: readonly Transaction[] | undefined
} = {}) {
  const live = useLiveQuery(
    async () => (injectedTransactions ? null : repositories.transactions.list()),
    [injectedTransactions],
  )
  const transactions = injectedTransactions ?? live ?? null
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(loadDismissedCreepKeys)

  // Local-notification hookup: session singleton (same pattern as the
  // budget/bill reminder sync), so transaction commits keep reconciling
  // creep reminders after leaving this page.
  useEffect(() => {
    ensureCreepStoreSync()
  }, [])

  const creeps = useMemo(() => detectBillCreep(transactions ?? []), [transactions])
  const visible = useMemo(
    () => creeps.filter((creep) => !dismissed.has(creep.key)),
    [creeps, dismissed],
  )
  const dismissedCreeps = useMemo(
    () => creeps.filter((creep) => dismissed.has(creep.key)),
    [creeps, dismissed],
  )

  if (!transactions) return <output>Loading bill creep…</output>

  function onDismiss(key: string) {
    setDismissed(dismissCreepKey(key))
  }

  function onRestore(key: string) {
    setDismissed(restoreCreepKey(key))
  }

  return (
    <section aria-label="Bill creep" id="bill-creep">
      <Card>
        <CardHeader>
          <CardTitle>Bill creep</CardTitle>
          <CardDescription>Recurring charges that rose above their usual amount.</CardDescription>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bill increases detected.</p>
          ) : (
            <ul className="divide-y">
              {visible.map((creep) => (
                <CreepRow key={creep.key} creep={creep} onDismiss={onDismiss} />
              ))}
            </ul>
          )}
          {dismissedCreeps.length > 0 ? (
            <div className="mt-4 rounded-lg border p-3">
              <h3 className="text-sm font-medium">Dismissed increases</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Dismissed merchants stay out of this list until restored.
              </p>
              <ul className="mt-2 grid gap-1">
                {dismissedCreeps.map((creep) => (
                  <li key={creep.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{creep.displayName}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Restore ${creep.displayName} bill creep`}
                      onClick={() => onRestore(creep.key)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
