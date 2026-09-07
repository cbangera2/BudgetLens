import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"
import type { Transaction } from "@/domain/models"
import { formatMoney } from "@/features/dashboard/format"

import { buildInsightsDigest, formatInsightsPercent, type Insight } from "./digest"
import {
  dismissInsight,
  dismissInsightsCard,
  readInsightsDismissals,
  restoreDigestInsights,
  restoreInsightsCard,
} from "./dismissal"

type InsightStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined

function defaultStorage(): InsightStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
  } catch {
    return null
  }
  return null
}

function insightDetail(insight: Insight): string {
  if (insight.kind === "mover-up" || insight.kind === "mover-down") {
    const mover = insight.mover
    if (!mover) return ""
    const delta = `${mover.deltaMinor >= 0 ? "+" : ""}${formatMoney(mover.deltaMinor)}`
    return `${formatMoney(mover.previousMinor)} → ${formatMoney(mover.currentMinor)} (${delta}, ${formatInsightsPercent(mover.percent)})`
  }
  if (insight.kind === "new-merchant") {
    const merchant = insight.newMerchant
    if (!merchant) return ""
    const count = merchant.count === 1 ? "1 charge" : `${merchant.count} charges`
    return `${formatMoney(merchant.totalMinor)} · ${count}`
  }
  const dead = insight.deadSubscription
  if (!dead) return ""
  return `Last seen ${dead.lastDate} · ${formatMoney(dead.lastAmountMinor)}`
}

function insightKindLabel(insight: Insight): string {
  switch (insight.kind) {
    case "mover-up":
      return "Spending up"
    case "mover-down":
      return "Spending down"
    case "new-merchant":
      return "New merchant"
    case "dead-subscription":
      return "Possibly ended"
    default:
      return "Insight"
  }
}

function insightLinkLabel(insight: Insight): string {
  if (insight.kind === "mover-up" || insight.kind === "mover-down") {
    return `View ${insight.title} transactions for the current month`
  }
  if (insight.kind === "new-merchant") {
    return `View ${insight.title} transactions for the current month`
  }
  return `View ${insight.title} transactions for the previous month`
}

export function InsightsSection({
  transactions: injectedTransactions,
  storage: storageProp,
}: {
  transactions?: readonly Transaction[]
  storage?: InsightStorage
} = {}) {
  const live = useLiveQuery(
    async () => (injectedTransactions ? null : repositories.transactions.list()),
    [injectedTransactions],
  )
  const storage = storageProp !== undefined ? storageProp : defaultStorage()
  const [dismissed, setDismissed] = useState(() => readInsightsDismissals(storage))

  const transactions = injectedTransactions ?? live
  const digest = useMemo(
    () => (transactions ? buildInsightsDigest(transactions) : null),
    [transactions],
  )

  if (!transactions || !digest) return <output>Loading insights…</output>

  if (!digest.hasEnoughHistory || !digest.digestKey) {
    return (
      <section aria-label="Insights">
        <Card>
          <CardHeader>
            <CardTitle>Insights</CardTitle>
            <CardDescription>
              Month-over-month movers, new merchants, and subscriptions that may have ended.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Not enough history yet. Insights appear once transactions span at least two calendar
              months.
            </p>
            <p className="text-sm">
              <Link to="/imports" className="font-medium text-primary underline underline-offset-4">
                Import another month of data
              </Link>{" "}
              <span className="text-muted-foreground">
                to compare {digest.currentMonth ?? "this month"} against a prior month.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>
    )
  }

  const digestKey = digest.digestKey
  if (dismissed.cards.has(digestKey)) {
    return (
      <section aria-label="Insights">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Insights for {digest.previousMonth} → {digest.currentMonth} dismissed.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setDismissed((current) => restoreInsightsCard(storage, digestKey, current))
              }
            >
              Show insights again
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  const visible = digest.insights.filter((insight) => !dismissed.insights.has(insight.id))
  const dismissedCount = digest.insights.length - visible.length

  return (
    <section aria-label="Insights">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Insights</CardTitle>
              <CardDescription>
                Month-over-month movers for {digest.previousMonth} → {digest.currentMonth}, computed
                locally from your transactions.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Dismiss insights card"
              onClick={() =>
                setDismissed((current) => dismissInsightsCard(storage, digestKey, current))
              }
            >
              Dismiss
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {visible.length === 0 ? (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">
                {digest.insights.length === 0
                  ? "No big movers this month. Spending looks steady across categories."
                  : "All insights dismissed. Nothing left to review for this period."}
              </p>
              {dismissedCount > 0 && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDismissed((current) => restoreDigestInsights(storage, digestKey, current))
                    }
                  >
                    Restore dismissed insights
                  </Button>
                </div>
              )}
              {digest.insights.length === 0 && digest.currentFrom && digest.currentTo && (
                <p className="text-sm">
                  <Link
                    to="/transactions"
                    search={{ from: digest.currentFrom, to: digest.currentTo }}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    Browse this month&apos;s transactions
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <>
              <ul className="grid gap-3">
                {visible.map((insight) => (
                  <li
                    key={insight.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {insightKindLabel(insight)}
                      </p>
                      <p className="mt-0.5 font-medium">
                        <Link
                          to="/transactions"
                          search={insight.link}
                          aria-label={insightLinkLabel(insight)}
                          className="underline-offset-4 hover:underline"
                        >
                          {insight.title}
                        </Link>
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                        {insightDetail(insight)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Dismiss insight: ${insight.title}`}
                      onClick={() =>
                        setDismissed((current) => dismissInsight(storage, insight.id, current))
                      }
                    >
                      Dismiss
                    </Button>
                  </li>
                ))}
              </ul>
              {dismissedCount > 0 && (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDismissed((current) => restoreDigestInsights(storage, digestKey, current))
                    }
                  >
                    Restore {dismissedCount} dismissed
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
