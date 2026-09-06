import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { WealthSnapshot } from "@/domain/models"
import { parseGoalInput, type NetWorthGoal } from "@/features/goals/model"
import { projectNetWorthGoal } from "@/features/goals/projections"

function formatMoney(minor: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatDate(date: string, locale?: string): string {
  const [yearText = "0", monthText = "1", dayText = "1"] = date.split("-")
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))))
}

export interface GoalPanelProps {
  snapshots: readonly WealthSnapshot[]
  today: string
  locale?: string
  goal: NetWorthGoal | null
  onSave: (goal: NetWorthGoal) => void
  onClear: () => void
}

export function GoalPanel({ snapshots, today, locale, goal, onSave, onClear }: GoalPanelProps) {
  const [amount, setAmount] = useState(() => (goal ? String(goal.targetAmountMinor / 100) : ""))
  const [targetDate, setTargetDate] = useState(() => goal?.targetDate ?? "")
  const [error, setError] = useState("")

  const history = snapshots
    .filter((snapshot) => snapshot.series === "netWorth")
    .map((snapshot) => ({ date: snapshot.date, valueMinor: snapshot.valueMinor }))
  const projection = goal ? projectNetWorthGoal(history, today, goal) : null

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = parseGoalInput(amount, targetDate)
    if (!next) {
      setError("Enter a target amount greater than zero and a valid target date (YYYY-MM-DD).")
      return
    }
    setError("")
    onSave(next)
  }

  return (
    <Card aria-labelledby="net-worth-goal-title">
      <CardHeader>
        <CardTitle id="net-worth-goal-title">Net-worth goal</CardTitle>
        <CardDescription>
          Set one target amount and date to track your pace against the wealth history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {projection && goal ? (
          <div className="space-y-1 text-sm" aria-live="polite">
            <p>
              Target {formatMoney(goal.targetAmountMinor, locale)} by{" "}
              {formatDate(goal.targetDate, locale)}.
            </p>
            {projection.paceMinorPerMonth === null ? (
              <p>Pace unavailable: add more net-worth history to estimate your pace.</p>
            ) : (
              <p>Current pace {formatMoney(projection.paceMinorPerMonth, locale)} per month.</p>
            )}
            {projection.status === "achieved" ? (
              <p>Target already reached.</p>
            ) : projection.status === "single-point" ? (
              <p>Projection unavailable: a single observation cannot set a pace.</p>
            ) : projection.status === "past-target" ? (
              <p>Target date has passed: choose a future date to track this goal.</p>
            ) : projection.status === "on-track" && projection.projectedHitDate ? (
              <p>
                Projected to reach the target on {formatDate(projection.projectedHitDate, locale)} —
                on track.
              </p>
            ) : projection.status === "off-track" && projection.projectedHitDate ? (
              <p>
                Projected to reach the target on {formatDate(projection.projectedHitDate, locale)} —
                off track.
              </p>
            ) : projection.status === "off-track" ? (
              <p>Off track: the current pace does not reach the target.</p>
            ) : null}
            {projection.requiredMinorPerMonth !== null && projection.status !== "achieved" ? (
              <p>
                Required pace {formatMoney(projection.requiredMinorPerMonth, locale)} per month to
                reach the target on time.
              </p>
            ) : null}
          </div>
        ) : null}

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          {error ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="net-worth-goal-amount">Target amount</Label>
            <Input
              id="net-worth-goal-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="net-worth-goal-date">Target date</Label>
            <Input
              id="net-worth-goal-date"
              type="date"
              required
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            {goal ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAmount("")
                  setTargetDate("")
                  setError("")
                  onClear()
                }}
              >
                Delete goal
              </Button>
            ) : null}
            <Button type="submit">Save goal</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
