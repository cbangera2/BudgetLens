import { useLiveQuery } from "dexie-react-hooks"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"

import { detectSubscriptions } from "./detect"

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
    amountMinor / 100,
  )
}

export function SubscriptionsSection() {
  const transactions = useLiveQuery(() => repositories.transactions.list(), [])

  if (!transactions) return <output>Loading subscriptions…</output>

  const { subscriptions, totalMonthlyBurnMinor } = detectSubscriptions(transactions)

  return (
    <section aria-label="Subscriptions">
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>Recurring merchants detected from transaction history.</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recurring subscriptions detected yet.
            </p>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm">
                Total monthly burn:{" "}
                <span className="font-semibold tabular-nums">
                  {formatMoney(totalMonthlyBurnMinor)}
                </span>
              </p>
              <ul className="divide-y">
                {subscriptions.map((subscription) => (
                  <li
                    key={subscription.key}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span>
                      <span className="block font-medium">{subscription.displayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {subscription.cadence} · {subscription.occurrences} charges · last{" "}
                        {subscription.lastDate}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(subscription.monthlyBurnMinor)}
                      <span className="text-xs text-muted-foreground">/mo</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
