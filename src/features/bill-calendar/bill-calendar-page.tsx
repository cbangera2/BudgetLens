import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { useMemo, useState } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"
import type { IsoDate, Transaction } from "@/domain/models"
import { detectSubscriptions } from "@/features/subscriptions/detect"

import {
  addMonthsToKey,
  canNavigateNext,
  canNavigatePrev,
  clampMonthKey,
  countOverdue,
  currentMonthKey,
  earliestSubscriptionMonth,
  formatBillMoney,
  isMonthKey,
  monthDayCount,
  monthEndIso,
  monthLabel,
  monthStartIso,
  monthStartWeekday,
  monthTotalMinor,
  OVERDUE_TOLERANCE_DAYS,
  projectMonthBills,
  resolveMonthBounds,
  toMonthKey,
  type BillOccurrence,
  type MonthKey,
} from "./calendar"

const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

function localTodayIso(): IsoDate {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function dayNumber(date: IsoDate): number {
  return Number(date.slice(8, 10))
}

function DayCell({
  date,
  bills,
  isToday,
}: {
  date: IsoDate
  bills: readonly BillOccurrence[]
  isToday: boolean
}) {
  return (
    <td data-date={date} data-today={isToday ? "true" : undefined} className="p-0.5 align-top">
      <div
        className={`min-h-16 rounded-lg border p-1 sm:min-h-20 ${
          isToday ? "border-primary ring-1 ring-primary" : "border-border"
        }`}
      >
        <span
          className={`block px-0.5 text-xs tabular-nums ${
            isToday ? "font-bold text-primary" : "text-muted-foreground"
          }`}
        >
          {dayNumber(date)}
        </span>
        {bills.length > 0 ? (
          <ul
            aria-label={`${date}, ${bills.length} bill${bills.length === 1 ? "" : "s"}`}
            className="mt-1 grid gap-1"
          >
            {bills.map((occurrence) => (
              <BillChip
                key={`${occurrence.subscriptionKey}-${occurrence.date}`}
                occurrence={occurrence}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </td>
  )
}

/** Lay the month out as Sunday-first weeks; `null` pads days outside the month. */
interface MonthWeekCell {
  id: string
  date: IsoDate | null
}

interface MonthWeek {
  key: string
  cells: MonthWeekCell[]
}

function monthWeeks(month: MonthKey): MonthWeek[] {
  const cells: MonthWeekCell[] = []
  const leading = monthStartWeekday(month)
  for (let pad = 0; pad < leading; pad += 1) {
    cells.push({ id: `${month}-leading-${pad}`, date: null })
  }
  for (let day = 1; day <= monthDayCount(month); day += 1) {
    const date: IsoDate = `${month}-${String(day).padStart(2, "0")}`
    cells.push({ id: date, date })
  }
  let trailing = 0
  while (cells.length % 7 !== 0) {
    cells.push({ id: `${month}-trailing-${trailing}`, date: null })
    trailing += 1
  }
  const weeks: MonthWeek[] = []
  for (let start = 0; start < cells.length; start += 7) {
    const slice = cells.slice(start, start + 7)
    const firstDate = slice.find((cell) => cell.date !== null)?.date ?? month
    weeks.push({ key: firstDate, cells: slice })
  }
  return weeks
}

function BillChip({ occurrence }: { occurrence: BillOccurrence }) {
  const overdue = occurrence.status === "overdue"
  return (
    <li
      data-status={occurrence.status}
      aria-label={
        overdue
          ? `${occurrence.displayName} ${formatBillMoney(occurrence.amountMinor)} overdue, expected ${occurrence.date}`
          : `${occurrence.displayName} ${formatBillMoney(occurrence.amountMinor)} on ${occurrence.date}`
      }
      className={`rounded-md border px-1.5 py-1 text-xs leading-tight ${
        overdue
          ? "border-destructive/60 bg-destructive/10 text-destructive"
          : "border-border bg-muted/60 text-foreground"
      }`}
    >
      <span className="block truncate font-medium">{occurrence.displayName}</span>
      <span className="flex items-center justify-between gap-1 tabular-nums">
        <span>{formatBillMoney(occurrence.amountMinor)}</span>
        {overdue ? <span className="font-semibold tracking-wide uppercase">Overdue</span> : null}
      </span>
    </li>
  )
}

export function BillCalendarPageContent({
  transactions: injectedTransactions,
  today: injectedToday,
  initialMonthKey,
}: {
  transactions?: readonly Transaction[] | undefined
  today?: IsoDate | undefined
  initialMonthKey?: MonthKey | undefined
} = {}) {
  const live = useLiveQuery(
    async () => (injectedTransactions ? null : repositories.transactions.list()),
    [injectedTransactions],
  )
  const today = injectedToday ?? localTodayIso()
  const transactions = injectedTransactions ?? live ?? null

  const subscriptions = useMemo(() => detectSubscriptions(transactions ?? []), [transactions])
  const bounds = useMemo(
    () => resolveMonthBounds(today, earliestSubscriptionMonth(subscriptions.subscriptions)),
    [today, subscriptions],
  )
  const currentMonth = currentMonthKey(today)
  const [viewedMonth, setViewedMonth] = useState<MonthKey>(() =>
    clampMonthKey(
      initialMonthKey && isMonthKey(initialMonthKey) ? initialMonthKey : currentMonth,
      bounds,
    ),
  )
  const clampedMonth = clampMonthKey(isMonthKey(viewedMonth) ? viewedMonth : currentMonth, bounds)

  const occurrences = useMemo(
    () => projectMonthBills(subscriptions.subscriptions, clampedMonth, today),
    [subscriptions, clampedMonth, today],
  )
  const byDate = useMemo(() => {
    const grouped = new Map<IsoDate, BillOccurrence[]>()
    for (const occurrence of occurrences) {
      grouped.set(occurrence.date, [...(grouped.get(occurrence.date) ?? []), occurrence])
    }
    return grouped
  }, [occurrences])
  const weeks = useMemo(() => monthWeeks(clampedMonth), [clampedMonth])

  if (!transactions) return <output>Loading bill calendar…</output>

  const totalMinor = monthTotalMinor(occurrences)
  const overdueCount = countOverdue(occurrences)
  const prevMonth = addMonthsToKey(clampedMonth, -1)
  const nextMonth = addMonthsToKey(clampedMonth, 1)
  const prevEnabled = canNavigatePrev(clampedMonth, bounds)
  const nextEnabled = canNavigateNext(clampedMonth, bounds)
  const start = monthStartIso(clampedMonth)
  const end = monthEndIso(clampedMonth)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bills</h1>
        <p className="mt-1 text-muted-foreground">
          Recurring charges projected from detected merchants. Bills more than{" "}
          {OVERDUE_TOLERANCE_DAYS} days past their expected date are marked overdue.
        </p>
      </div>

      <section aria-label="Bill calendar">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{monthLabel(clampedMonth)}</CardTitle>
                <CardDescription>
                  {occurrences.length === 0
                    ? "No bills expected this month."
                    : `Month total ${formatBillMoney(totalMinor)} across ${occurrences.length} bill${occurrences.length === 1 ? "" : "s"}${
                        overdueCount > 0 ? ` · ${overdueCount} overdue` : ""
                      }.`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  disabled={!prevEnabled}
                  onClick={() => setViewedMonth(clampMonthKey(prevMonth, bounds))}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <p
                  aria-hidden="true"
                  className="min-w-28 text-center text-sm font-semibold tabular-nums"
                >
                  {monthLabel(clampedMonth)}
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={!nextEnabled}
                  onClick={() => setViewedMonth(clampMonthKey(nextMonth, bounds))}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg px-2 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewedMonth(clampMonthKey(currentMonth, bounds))}
                  disabled={clampedMonth === currentMonth}
                  className="ml-1 min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Today
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {subscriptions.subscriptions.length === 0 ? (
              <div className="grid gap-2 py-6 text-center">
                <p className="font-medium">No recurring bills detected yet</p>
                <p className="text-sm text-muted-foreground">
                  Import transactions and charges that repeat on a steady cadence will appear here.
                </p>
                <p>
                  <Link to="/imports" className="text-sm font-medium underline underline-offset-4">
                    Import transactions
                  </Link>
                </p>
              </div>
            ) : occurrences.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No bills expected between {start} and {end}.
              </p>
            ) : (
              <table className="w-full table-fixed border-collapse">
                <caption className="sr-only">Bills for {monthLabel(clampedMonth)}</caption>
                <thead>
                  <tr>
                    {WEEKDAY_HEADERS.map((day) => (
                      <th
                        key={day}
                        scope="col"
                        className="px-1 py-1 text-center text-xs font-medium text-muted-foreground"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week.key}>
                      {week.cells.map((cell) =>
                        cell.date === null ? (
                          <td key={cell.id} aria-hidden="true" />
                        ) : (
                          <DayCell
                            key={cell.id}
                            date={cell.date}
                            bills={byDate.get(cell.date) ?? []}
                            isToday={cell.date === today}
                          />
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Projected from {subscriptions.subscriptions.length} detected recurring merchant
              {subscriptions.subscriptions.length === 1 ? "" : "s"} for{" "}
              {toMonthKey(today) === clampedMonth ? "the current month" : monthLabel(clampedMonth)};
              months run {bounds.min} to {bounds.max}.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
