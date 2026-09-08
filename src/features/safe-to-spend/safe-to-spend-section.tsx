import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { useMemo, useState } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"
import type { BudgetGoal, IsoDate, Transaction } from "@/domain/models"
import { formatMoney } from "@/features/dashboard/format"
import { detectSubscriptions } from "@/features/subscriptions/detect"

import {
  calculateSafeToSpend,
  SAFE_TO_SPEND_TRAILING_LOOKBACK_DAYS,
  type SafeToSpendResult,
} from "./calculator"

export const SAFE_TO_SPEND_FORMULA_FOOTNOTE =
  "Safe-to-spend = income received this month − recurring bills due before month-end − " +
  "pro-rated budget burn for the days left, floored at $0. Income is never projected: " +
  "only money already received counts."

function BreakdownRow({
  label,
  value,
  detail,
  linkTo,
  linkLabel,
}: {
  label: string
  value: string
  detail: string
  linkTo: string
  linkLabel: string
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-2 text-sm">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>{" "}
        <Link to={linkTo} className="text-xs font-medium text-primary underline underline-offset-4">
          {linkLabel}
        </Link>
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </li>
  )
}

function Breakdown({ result }: { result: SafeToSpendResult }) {
  const billDetail =
    result.bills.length === 0
      ? "No recurring bills due before month-end"
      : result.bills
          .map((bill) => `${bill.displayName} ${bill.date} (${formatMoney(bill.amountMinor)})`)
          .join(", ")
  const burnDetail = result.usedTrailingAverage
    ? `No budgets set: trailing ${SAFE_TO_SPEND_TRAILING_LOOKBACK_DAYS}-day average of ` +
      `${formatMoney(Math.round(result.trailingDailySpendMinor ?? 0))}/day × ` +
      `${result.remainingDays} days left`
    : `${formatMoney(Math.round(result.dailyBurnMinor))}/day of budget × ` +
      `${result.remainingDays} days left`
  return (
    <div>
      <ul className="divide-y">
        <BreakdownRow
          label="Income received"
          value={formatMoney(result.incomeMinor)}
          detail={`${result.monthStart} through ${result.today}. Future paydays are not counted.`}
          linkTo="/transactions"
          linkLabel="View transactions"
        />
        <BreakdownRow
          label="Bills due before month-end"
          value={formatMoney(result.billsDueMinor)}
          detail={billDetail}
          linkTo="/bills"
          linkLabel="View bills"
        />
        <BreakdownRow
          label="Planned burn for days left"
          value={formatMoney(result.burnMinor)}
          detail={burnDetail}
          linkTo="/budgets"
          linkLabel="View budgets"
        />
      </ul>
      <p className="mt-2 text-sm tabular-nums" data-testid="safe-to-spend-math">
        {formatMoney(result.incomeMinor)} − {formatMoney(result.billsDueMinor)} −{" "}
        {formatMoney(result.burnMinor)} = {formatMoney(result.safeMinor)} (floored at $0)
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{SAFE_TO_SPEND_FORMULA_FOOTNOTE}</p>
    </div>
  )
}

export function SafeToSpendSection({
  transactions: injectedTransactions,
  goals: injectedGoals,
  today,
}: {
  transactions?: readonly Transaction[]
  goals?: readonly BudgetGoal[]
  today?: IsoDate
} = {}) {
  const live = useLiveQuery(
    async () =>
      injectedTransactions && injectedGoals
        ? null
        : Promise.all([repositories.transactions.list(), repositories.budgets.list()]),
    [injectedTransactions, injectedGoals],
  )
  const [expanded, setExpanded] = useState(false)

  const transactions = injectedTransactions ?? live?.[0] ?? null
  const goals = injectedGoals ?? live?.[1] ?? null

  const result = useMemo(() => {
    if (!transactions || !goals) return null
    // Read-only reuse: detection output feeds the bills-due calculation.
    const { subscriptions } = detectSubscriptions(transactions)
    return calculateSafeToSpend({ transactions, subscriptions, goals, today })
  }, [transactions, goals, today])

  if (!transactions || !goals || !result) return <output>Loading safe-to-spend…</output>

  return (
    <section aria-label="Safe to spend">
      <Card>
        <CardHeader>
          <CardTitle>Safe to spend</CardTitle>
          <CardDescription>
            Can you spend today? One calm number for the rest of {result.monthStart.slice(0, 7)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p
            className="text-4xl font-semibold tracking-tight tabular-nums"
            data-testid="safe-to-spend-amount"
          >
            {formatMoney(result.safeMinor)}
          </p>
          {!result.hasIncome && (
            <p className="text-sm text-muted-foreground">
              No income recorded yet this month.{" "}
              <Link to="/imports" className="font-medium text-primary underline underline-offset-4">
                Import a paycheck
              </Link>{" "}
              to unlock your number — bills and planned burn are still tracked below.
            </p>
          )}
          {result.usedTrailingAverage && (
            <p className="text-sm text-muted-foreground">
              No budgets set, so the burn below is estimated from your trailing{" "}
              {SAFE_TO_SPEND_TRAILING_LOOKBACK_DAYS}-day average daily spend.{" "}
              <Link to="/budgets" className="font-medium text-primary underline underline-offset-4">
                Set a budget
              </Link>{" "}
              for a firmer number.
            </p>
          )}
          <div>
            <button
              type="button"
              className="text-sm font-medium text-primary underline underline-offset-4"
              aria-expanded={expanded}
              aria-controls="safe-to-spend-breakdown"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Hide the math" : "How this is calculated"}
            </button>
            {expanded && (
              <div id="safe-to-spend-breakdown" className="mt-2">
                <Breakdown result={result} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
