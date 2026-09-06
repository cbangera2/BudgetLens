import { useMemo } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Transaction } from "@/domain/models"
import { formatMoney } from "@/features/dashboard/format"

import { settleGroupTransactions } from "./settle"

export function SettleUpSection({ transactions }: { transactions: readonly Transaction[] }) {
  const result = useMemo(() => settleGroupTransactions(transactions), [transactions])
  const sharedCount = result.sharedCount

  let body: React.ReactNode
  if (transactions.length === 0 || result.memberCount === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        No transactions in this group yet — add some to see suggested paybacks.
      </p>
    )
  } else if (sharedCount === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        No shared expenses yet — mark a transaction as shared to see suggested paybacks.
      </p>
    )
  } else if (result.memberCount <= 1) {
    body = (
      <p className="text-sm text-muted-foreground">
        Only one payer in this group so far — nothing to settle.
      </p>
    )
  } else if (result.transfers.length === 0) {
    body = <p className="text-sm text-muted-foreground">Everyone is settled up.</p>
  } else {
    body = (
      <ul className="grid gap-2">
        {result.transfers.map((transfer) => (
          <li
            key={`${transfer.from}-${transfer.to}`}
            className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border p-3 text-sm"
          >
            <span aria-hidden="true">
              <strong className="font-semibold">{transfer.from}</strong>
              <span> → </span>
              <strong className="font-semibold">{transfer.to}</strong>
            </span>
            <span aria-hidden="true" className="font-semibold tabular-nums">
              {formatMoney(transfer.amountMinor)}
            </span>
            <span className="sr-only">
              {transfer.from} pays {transfer.to} {formatMoney(transfer.amountMinor)}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card aria-labelledby="settle-up-title">
      <CardHeader>
        <CardTitle id="settle-up-title">Settle up</CardTitle>
        <CardDescription>
          Suggested paybacks from shared expenses. Informational only — no money moves and nothing
          is written back to your transactions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {body}
        {result.balances.length > 1 && result.transfers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            The payer keeps their share-count portion of each shared expense and the rest is divided
            among the other members; payers are inferred from account names.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
