import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"
import { MonthlyCloseSection } from "@/features/monthly-close/monthly-close-section"
import { useTransactionRules } from "@/features/rules/store"
import { SubscriptionsSection } from "@/features/subscriptions/subscriptions-section"
import { useTransferFlags } from "@/features/transfers/store"
import { TransfersSection } from "@/features/transfers/transfers-section"

import { isReviewQueueEmpty, summarizeReviewQueues, type ReviewQueueCounts } from "./summary"

function QueueCard({
  title,
  description,
  count,
  countLabel,
  testId,
  children,
}: {
  title: string
  description: string
  count: number
  countLabel: string
  testId: string
  children: React.ReactNode
}) {
  return (
    <li>
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p
            className="text-2xl font-semibold tabular-nums"
            aria-label={countLabel}
            data-testid={testId}
          >
            {count}
          </p>
          <div>{children}</div>
        </CardContent>
      </Card>
    </li>
  )
}

export function ReviewQueueCards({ counts }: { counts: ReviewQueueCounts }) {
  return (
    <div className="grid gap-4">
      {isReviewQueueEmpty(counts) ? (
        <Card aria-labelledby="review-empty-title">
          <CardHeader>
            <CardTitle id="review-empty-title">You are all caught up</CardTitle>
            <CardDescription>
              Nothing needs approval right now. New transfers, subscriptions, and uncategorized
              transactions will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/imports">Import transactions</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/transactions">Browse transactions</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <ul aria-label="Review queues" className="grid gap-4 sm:grid-cols-2">
        <QueueCard
          title="Transfers to confirm"
          description="Suggested moves between your own accounts."
          count={counts.transfersQueue}
          countLabel={`${counts.transfersQueue} transfers awaiting review`}
          testId="review-count-transfers"
        >
          <Button asChild variant="outline" size="sm">
            <a href="#review-transfers">Open transfers queue</a>
          </Button>
        </QueueCard>
        <QueueCard
          title="Subscriptions found"
          description="Recurring merchants detected from history."
          count={counts.subscriptionsFound}
          countLabel={`${counts.subscriptionsFound} subscriptions found`}
          testId="review-count-subscriptions"
        >
          <Button asChild variant="outline" size="sm">
            <a href="#review-subscriptions">View subscriptions</a>
          </Button>
        </QueueCard>
        <QueueCard
          title="Transaction rules"
          description="Automatic categorization during import."
          count={counts.rulesActive}
          countLabel={`${counts.rulesActive} transaction rules active`}
          testId="review-count-rules"
        >
          <Button asChild variant="outline" size="sm">
            <Link to="/imports">Manage rules</Link>
          </Button>
        </QueueCard>
        <QueueCard
          title="Uncategorized triage"
          description="Transactions still needing a category."
          count={counts.uncategorized}
          countLabel={`${counts.uncategorized} uncategorized transactions`}
          testId="review-count-uncategorized"
        >
          <Button asChild variant="outline" size="sm">
            <Link to="/transactions">Triage uncategorized</Link>
          </Button>
        </QueueCard>
      </ul>
    </div>
  )
}

export function ReviewPageContent() {
  const transactions = useLiveQuery(() => repositories.transactions.list(), [])
  const [rules] = useTransactionRules()
  const transferFlags = useTransferFlags()
  const counts = useMemo(
    () =>
      summarizeReviewQueues({
        transactions: transactions ?? [],
        transferFlags: transferFlags.flags,
        ruleCount: rules.length,
      }),
    [transactions, rules, transferFlags.flags],
  )

  if (!transactions) return <output>Loading review…</output>

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Review</h1>
        <p className="mt-1 text-muted-foreground">Things the app found for you to approve.</p>
      </div>
      <MonthlyCloseSection transactions={transactions} />
      <ReviewQueueCards counts={counts} />
      <div id="review-transfers" className="scroll-mt-24">
        <TransfersSection transactions={transactions} flagActions={transferFlags} />
      </div>
      <div id="review-subscriptions" className="scroll-mt-24">
        <SubscriptionsSection />
      </div>
    </div>
  )
}
