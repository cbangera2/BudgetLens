import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { repositories } from "@/db/repositories"
import type { Transaction } from "@/domain/models"
import { detectSpendingAnomalies, type SpendingAnomaly } from "@/features/assistant/data-tools"
import { detectSubscriptions, normalizeMerchant } from "@/features/subscriptions/detect"

import { closingMonthFor, formatMonthLabel, monthRange } from "./month"
import {
  clearRecurringDecision,
  closeMonth,
  completeRecurringStep,
  completeTriageStep,
  dismissCloseBanner,
  getMonthRecord,
  readMonthlyCloseStore,
  reopenMonth,
  setCloseStep,
  setRecurringDecision,
  shouldShowCloseBanner,
  skipCloseMonth,
  startClose,
  unskipCloseMonth,
  writeMonthlyCloseStore,
  type MonthlyCloseRecord,
  type MonthlyCloseStorage,
  type MonthlyCloseStoreShape,
} from "./store"
import {
  buildCloseShareText,
  buildCloseVerdict,
  formatCloseMoney,
  summarizeCloseMonth,
  uncategorizedForMonth,
} from "./summary"

function defaultStorage(): MonthlyCloseStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
  } catch {
    return null
  }
  return null
}

function useMonthlyCloseShape(storage: MonthlyCloseStorage) {
  const [shape, setShape] = useState<MonthlyCloseStoreShape>(() => readMonthlyCloseStore(storage))

  useEffect(() => {
    setShape(readMonthlyCloseStore(storage))
  }, [storage])

  useEffect(() => {
    if (typeof window === "undefined") return () => undefined
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "budgetlens.monthly-close.v1") {
        setShape(readMonthlyCloseStore(storage))
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [storage])

  const update = (mutate: (shape: MonthlyCloseStoreShape) => MonthlyCloseStoreShape) => {
    setShape((previous) => {
      const next = mutate(previous)
      writeMonthlyCloseStore(storage, next)
      return next
    })
  }

  return { shape, update }
}

export interface ExpectedRecurringItem {
  key: string
  displayName: string
  landed: boolean
  lastDate: string
  monthlyBurnMinor: number
  decision: "confirmed" | "missing" | null
}

export function buildExpectedRecurring(
  transactions: readonly Transaction[],
  month: string,
  record: MonthlyCloseRecord,
): ExpectedRecurringItem[] {
  let subscriptions: ReturnType<typeof detectSubscriptions>["subscriptions"] = []
  try {
    subscriptions = detectSubscriptions(transactions).subscriptions
  } catch {
    subscriptions = []
  }
  const monthKeys = new Set<string>()
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) continue
    const key = normalizeMerchant(transaction.description)
    if (key) monthKeys.add(key)
  }
  return subscriptions.map((subscription) => ({
    key: subscription.key,
    displayName: subscription.displayName,
    landed: monthKeys.has(subscription.key),
    lastDate: subscription.lastDate,
    monthlyBurnMinor: subscription.monthlyBurnMinor,
    decision: record.confirmed[subscription.key] ?? null,
  }))
}

function TriageStep({
  rows,
  categoryOptions,
  monthLabel,
  onCategorized,
}: {
  rows: Transaction[]
  categoryOptions: string[]
  monthLabel: string
  onCategorized: (id: string, category: string) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="grid gap-2" data-testid="monthly-close-triage-clean">
        <p className="text-sm text-muted-foreground">
          No uncategorized transactions in {monthLabel}. Already clean.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="grid gap-2">
        {rows.map((transaction) => {
          const draft = drafts[transaction.id] ?? ""
          return (
            <li
              key={transaction.id}
              data-testid={`monthly-close-triage-row-${transaction.id}`}
              className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{transaction.description}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {transaction.date} · {formatCloseMoney(transaction.amountMinor)}
                </span>
              </span>
              <label className="sr-only" htmlFor={`monthly-close-category-${transaction.id}`}>
                Category for {transaction.description}
              </label>
              <Input
                id={`monthly-close-category-${transaction.id}`}
                className="h-8 w-40"
                placeholder="Category"
                list="monthly-close-category-options"
                value={draft}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [transaction.id]: event.target.value }))
                }
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draft.trim() === "" || savingId === transaction.id}
                onClick={() => {
                  const category = draft.trim()
                  if (!category) return
                  setSavingId(transaction.id)
                  setError(null)
                  void onCategorized(transaction.id, category)
                    .then(() => {
                      setDrafts((current) => {
                        const next = { ...current }
                        delete next[transaction.id]
                        return next
                      })
                    })
                    .catch(() => setError("Could not save that category. Try again."))
                    .finally(() => setSavingId(null))
                }}
              >
                {savingId === transaction.id ? "Saving…" : "Save"}
              </Button>
            </li>
          )
        })}
      </ul>
      <datalist id="monthly-close-category-options">
        {categoryOptions.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">
        {rows.length} uncategorized in {monthLabel}. Categorizing here updates the transaction.
      </p>
    </div>
  )
}

function RecurringStep({
  items,
  monthLabel,
  onConfirm,
  onFlagMissing,
  onClear,
}: {
  items: ExpectedRecurringItem[]
  monthLabel: string
  onConfirm: (key: string) => void
  onFlagMissing: (key: string) => void
  onClear: (key: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="grid gap-2" data-testid="monthly-close-recurring-clean">
        <p className="text-sm text-muted-foreground">
          No recurring charges detected. Nothing to confirm for {monthLabel}.
        </p>
      </div>
    )
  }

  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item.key}
          data-testid={`monthly-close-recurring-row-${item.key}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{item.displayName}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {item.landed ? `Landed in ${monthLabel}` : `No charge in ${monthLabel}`} · last{" "}
              {item.lastDate} · {formatCloseMoney(item.monthlyBurnMinor)}/mo
              {item.decision
                ? ` · ${item.decision === "confirmed" ? "confirmed" : "flagged missing"}`
                : ""}
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            {item.decision ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onClear(item.key)}>
                Undo
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Confirm ${item.displayName}`}
                  onClick={() => onConfirm(item.key)}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Flag missing ${item.displayName}`}
                  onClick={() => onFlagMissing(item.key)}
                >
                  Flag missing
                </Button>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

function anomalyLine(anomaly: SpendingAnomaly): string {
  if (anomaly.changePct === null) {
    return `${anomaly.category}: ${anomaly.current} (new vs ${anomaly.average})`
  }
  const sign = anomaly.changePct >= 0 ? "+" : ""
  return `${anomaly.category}: ${anomaly.current} vs ${anomaly.average} (${sign}${anomaly.changePct}%)`
}

function isAnomalyListResult(value: unknown): value is { anomalies: SpendingAnomaly[] } {
  if (typeof value !== "object" || value === null) return false
  if (!("anomalies" in value)) return false
  return Array.isArray(value.anomalies)
}

export function MonthlyCloseSection({
  transactions: injectedTransactions,
  storage: storageProp,
  now: nowProp,
}: {
  transactions?: readonly Transaction[]
  storage?: MonthlyCloseStorage
  now?: Date
} = {}) {
  const liveTransactions = useLiveQuery(
    async () => (injectedTransactions ? null : repositories.transactions.list()),
    [injectedTransactions],
  )
  const storage = storageProp !== undefined ? storageProp : defaultStorage()
  const now = nowProp ?? new Date()
  const { shape, update } = useMonthlyCloseShape(storage)

  const transactions = injectedTransactions ?? liveTransactions
  const closingMonth = closingMonthFor(now)
  const monthLabel = formatMonthLabel(closingMonth)
  const range = monthRange(closingMonth)
  const record = getMonthRecord(shape, closingMonth)

  const monthTransactions = useMemo(
    () => (transactions ?? []).filter((transaction) => transaction.date.startsWith(closingMonth)),
    [transactions, closingMonth],
  )
  const uncategorized = useMemo(
    () => (transactions ? uncategorizedForMonth(transactions, closingMonth) : null),
    [transactions, closingMonth],
  )
  const expectedRecurring = useMemo(
    () => (transactions ? buildExpectedRecurring(transactions, closingMonth, record) : null),
    // oxlint-disable-next-line exhaustive-deps -- record.confirmed drives decisions only.
    [transactions, closingMonth, record.confirmed, record.month],
  )
  const categoryOptions = useMemo(() => {
    const options = new Set<string>()
    for (const transaction of transactions ?? []) {
      const category = transaction.category?.trim()
      if (category) options.add(category)
    }
    return [...options].toSorted()
  }, [transactions])
  const summary = useMemo(
    () => (transactions ? summarizeCloseMonth(transactions, closingMonth) : null),
    [transactions, closingMonth],
  )
  const verdict = useMemo(() => (summary ? buildCloseVerdict(summary) : ""), [summary])

  const [anomalies, setAnomalies] = useState<SpendingAnomaly[] | null>(null)
  useEffect(() => {
    let cancelled = false
    setAnomalies(null)
    void detectSpendingAnomalies(repositories, {
      referenceDate: range.to,
      thresholdPct: 30,
      trailingMonths: 3,
      minSpendMinor: 0,
    })
      .then((result) => {
        if (cancelled) return
        const list = isAnomalyListResult(result) ? result.anomalies : []
        setAnomalies(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setAnomalies([])
      })
    return () => {
      cancelled = true
    }
  }, [range.to])

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  if (!transactions || !uncategorized || !expectedRecurring || !summary) {
    return <output>Loading monthly close…</output>
  }

  const hasActivity = monthTransactions.length > 0
  const showBanner = shouldShowCloseBanner(shape, closingMonth, hasActivity)

  if (record.skippedMonth) {
    return (
      <section aria-label="Monthly close" data-testid="monthly-close-skipped">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">Monthly close for {monthLabel} skipped.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update((current) => unskipCloseMonth(current, closingMonth))}
            >
              Reopen close
            </Button>
          </CardContent>
        </Card>
      </section>
    )
  }

  if (record.closedAt) {
    const anomalyLines = (anomalies ?? []).map(anomalyLine)
    const shareText = buildCloseShareText(summary, verdict, anomalyLines)
    return (
      <section aria-label="Monthly close" data-testid="monthly-close-closed">
        <Card>
          <CardHeader>
            <CardTitle>{monthLabel} closed</CardTitle>
            <CardDescription>A calm confirmation. Nothing else needs attention.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm" data-testid="monthly-close-verdict">
              {verdict}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              Income {formatCloseMoney(summary.incomeMinor)} · Spending{" "}
              {formatCloseMoney(summary.expenseMinor)} · Saved{" "}
              {formatCloseMoney(summary.savingsMinor)}
              {summary.savingsRate === null
                ? ""
                : ` · ${Math.round(summary.savingsRate * 100)}% savings rate`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const clipboard = navigator.clipboard
                  if (!clipboard) {
                    setCopyState("failed")
                    return
                  }
                  void clipboard
                    .writeText(shareText)
                    .then(() => setCopyState("copied"))
                    .catch(() => setCopyState("failed"))
                }}
              >
                {copyState === "copied" ? "Summary copied" : "Copy summary"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update((current) => reopenMonth(current, closingMonth))}
              >
                Reopen
              </Button>
            </div>
            {copyState === "failed" ? (
              <p role="alert" className="text-xs text-muted-foreground">
                Copy is unavailable in this browser.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    )
  }

  if (!record.started) {
    return (
      <div className="grid gap-4">
        {showBanner ? (
          <output
            data-testid="monthly-close-banner"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-sm"
          >
            <p className="min-w-0 flex-1">
              {monthLabel} has ended. Close the month in three calm steps.
            </p>
            <span className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => update((current) => startClose(current, closingMonth))}
              >
                Start monthly close
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Dismiss monthly close suggestion"
                onClick={() => update((current) => dismissCloseBanner(current, closingMonth))}
              >
                Dismiss
              </Button>
            </span>
          </output>
        ) : null}
        <section aria-label="Monthly close" data-testid="monthly-close-hub">
          <Card>
            <CardHeader>
              <CardTitle>Monthly close</CardTitle>
              <CardDescription>
                A guided end-of-month ritual: triage, recurring, then a calm summary for{" "}
                {monthLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-sm text-muted-foreground tabular-nums">
                {hasActivity
                  ? `${monthTransactions.length} transactions · ${uncategorized.length} uncategorized · ${expectedRecurring.length} recurring`
                  : `No transactions in ${monthLabel} yet.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => update((current) => startClose(current, closingMonth))}
                >
                  {record.step !== 1 || record.triageSkipped || record.recurringSkipped
                    ? "Resume close"
                    : "Start close"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => update((current) => skipCloseMonth(current, closingMonth))}
                >
                  Skip this month
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    )
  }

  const steps: Array<{ label: string; step: 1 | 2 | 3 }> = [
    { label: "Triage", step: 1 },
    { label: "Recurring", step: 2 },
    { label: "Summary", step: 3 },
  ]
  const decidedCount = expectedRecurring.filter((item) => item.decision !== null).length

  return (
    <section aria-label="Monthly close" data-testid="monthly-close-flow">
      <Card>
        <CardHeader>
          <CardTitle>Close {monthLabel}</CardTitle>
          <CardDescription>
            Step {record.step} of 3: {steps.find((entry) => entry.step === record.step)?.label}.
            Progress saves automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ol aria-label="Monthly close progress" className="flex flex-wrap gap-2 text-xs">
            {steps.map((entry) => {
              const stepNumber = entry.step
              const active = record.step === stepNumber
              const done = record.step > stepNumber
              return (
                <li
                  key={entry.label}
                  aria-current={active ? "step" : undefined}
                  data-testid={`monthly-close-progress-${stepNumber}`}
                  data-state={done ? "done" : active ? "active" : "todo"}
                  className={
                    active
                      ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
                      : done
                        ? "rounded-full bg-secondary px-3 py-1 text-secondary-foreground"
                        : "rounded-full border px-3 py-1 text-muted-foreground"
                  }
                >
                  {stepNumber}. {entry.label}
                </li>
              )
            })}
          </ol>

          {record.step === 1 ? (
            <div className="grid gap-3" data-testid="monthly-close-step-1">
              <TriageStep
                rows={uncategorized}
                categoryOptions={categoryOptions}
                monthLabel={monthLabel}
                onCategorized={async (id, category) => {
                  await repositories.transactions.update(id, { category })
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    update((current) => completeTriageStep(current, closingMonth, false))
                  }
                >
                  Continue
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update((current) => completeTriageStep(current, closingMonth, true))
                  }
                >
                  Skip triage
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => update((current) => skipCloseMonth(current, closingMonth))}
                >
                  Skip this month
                </Button>
              </div>
            </div>
          ) : null}

          {record.step === 2 ? (
            <div className="grid gap-3" data-testid="monthly-close-step-2">
              <RecurringStep
                items={expectedRecurring}
                monthLabel={monthLabel}
                onConfirm={(key) =>
                  update((current) => setRecurringDecision(current, closingMonth, key, "confirmed"))
                }
                onFlagMissing={(key) =>
                  update((current) => setRecurringDecision(current, closingMonth, key, "missing"))
                }
                onClear={(key) =>
                  update((current) => clearRecurringDecision(current, closingMonth, key))
                }
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {expectedRecurring.length === 0
                  ? "Fast path: no recurring charges to confirm."
                  : `${decidedCount} of ${expectedRecurring.length} reviewed.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => update((current) => setCloseStep(current, closingMonth, 1))}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    update((current) => completeRecurringStep(current, closingMonth, false))
                  }
                >
                  Continue
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update((current) => completeRecurringStep(current, closingMonth, true))
                  }
                >
                  Skip recurring
                </Button>
              </div>
            </div>
          ) : null}

          {record.step === 3 ? (
            <div className="grid gap-3" data-testid="monthly-close-step-3">
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-xl border p-3">
                  <dt className="text-xs text-muted-foreground">Income</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCloseMoney(summary.incomeMinor)}
                  </dd>
                </div>
                <div className="rounded-xl border p-3">
                  <dt className="text-xs text-muted-foreground">Spending</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatCloseMoney(summary.expenseMinor)}
                  </dd>
                </div>
                <div className="rounded-xl border p-3">
                  <dt className="text-xs text-muted-foreground">Savings rate</dt>
                  <dd className="font-semibold tabular-nums">
                    {summary.savingsRate === null
                      ? "No income"
                      : `${Math.round(summary.savingsRate * 100)}%`}
                  </dd>
                </div>
              </dl>
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Variance highlights</h3>
                {anomalies === null ? (
                  <p className="text-sm text-muted-foreground">Checking variance…</p>
                ) : anomalies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No big movers vs the trailing average. Spending looks steady.
                  </p>
                ) : (
                  <ul className="grid gap-1 text-sm tabular-nums">
                    {anomalies.slice(0, 3).map((anomaly) => (
                      <li key={anomaly.category}>- {anomalyLine(anomaly)}</li>
                    ))}
                  </ul>
                )}
                {summary.topCategories.length > 0 ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Top categories:{" "}
                    {summary.topCategories
                      .map((entry) => `${entry.category} ${formatCloseMoney(entry.amountMinor)}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
              <p className="text-sm" data-testid="monthly-close-verdict">
                {verdict}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => update((current) => setCloseStep(current, closingMonth, 2))}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => update((current) => closeMonth(current, closingMonth))}
                >
                  Close month
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
