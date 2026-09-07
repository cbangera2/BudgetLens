import { useEffect, useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SubscriptionSummary } from "@/features/subscriptions/detect"

import { formatBillMoney } from "./calendar"
import {
  DAY_OVERRIDE_CADENCE,
  overrideAmountDollars,
  parseOverrideAmountMinor,
  parseOverrideDayOfMonth,
  type BillOverride,
} from "./overrides"

export interface BillEditResult {
  /** Null means "reset to detected" (delete the stored override). */
  override: BillOverride | null
}

function dollarsPlaceholder(amountMinor: number): string {
  return overrideAmountDollars(amountMinor)
}

/**
 * Correction dialog for one detected bill. Empty amount/day fields mean "use
 * the detected value"; Save stores only what was entered. Save with everything
 * empty and dismiss unchecked resets the merchant to detected values.
 */
export function BillEditDialog({
  subscription,
  override,
  onSave,
  onClose,
}: {
  subscription: SubscriptionSummary
  override: BillOverride | undefined
  onSave: (result: BillEditResult) => void
  onClose: () => void
}) {
  const [amount, setAmount] = useState(
    override?.amountMinor !== undefined ? overrideAmountDollars(override.amountMinor) : "",
  )
  const [day, setDay] = useState(
    override?.dayOfMonth !== undefined ? String(override.dayOfMonth) : "",
  )
  const [dismissed, setDismissed] = useState(override?.dismissed === true)
  const [error, setError] = useState("")
  const daySupported = subscription.cadence === DAY_OVERRIDE_CADENCE
  const panelRef = useRef<HTMLDialogElement>(null)

  // The dialog renders inline (not top-layer), so Escape and Tab containment
  // are handled explicitly, mirroring the mobile More-sheet pattern: Escape
  // closes, Tab cycles within the panel while it is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ]
      const first = focusables.at(0)
      const last = focusables.at(-1)
      if (!first || !last) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmedAmount = amount.trim()
    const trimmedDay = day.trim()
    if (trimmedAmount) {
      if (parseOverrideAmountMinor(trimmedAmount) === null) {
        setError("Enter an amount greater than $0.00 (up to two decimals), or clear it.")
        return
      }
    }
    if (trimmedDay && daySupported) {
      if (parseOverrideDayOfMonth(trimmedDay) === null) {
        setError("Enter a day of the month from 1 to 31, or clear it.")
        return
      }
    }
    if (dismissed) {
      onSave({ override: { dismissed: true } })
      return
    }
    const next: BillOverride = {}
    const parsedAmount = trimmedAmount ? parseOverrideAmountMinor(trimmedAmount) : null
    if (parsedAmount !== null) next.amountMinor = parsedAmount
    const parsedDay = trimmedDay && daySupported ? parseOverrideDayOfMonth(trimmedDay) : null
    if (parsedDay !== null) next.dayOfMonth = parsedDay
    onSave({
      override: next.amountMinor === undefined && next.dayOfMonth === undefined ? null : next,
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4">
      <dialog
        open
        ref={panelRef}
        aria-modal="true"
        aria-labelledby="bill-edit-title"
        className="w-full max-w-sm rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl"
      >
        <h2 id="bill-edit-title" className="text-lg font-semibold tracking-tight">
          Edit {subscription.displayName} bill
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Detected {formatBillMoney(subscription.medianAmountMinor)} every{" "}
          {Math.max(1, Math.round(subscription.medianIntervalDays))} days · last seen{" "}
          {subscription.lastDate}. Empty fields keep the detected value.
        </p>
        <form className="mt-4 grid gap-4" onSubmit={submit} noValidate>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="bill-edit-amount">Expected amount (USD)</Label>
            <Input
              id="bill-edit-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder={dollarsPlaceholder(subscription.medianAmountMinor)}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bill-edit-day">Expected day of month</Label>
            <Input
              id="bill-edit-day"
              type="number"
              inputMode="numeric"
              min="1"
              max="31"
              step="1"
              placeholder="Auto"
              value={day}
              disabled={!daySupported}
              onChange={(event) => setDay(event.target.value)}
              aria-describedby={daySupported ? undefined : "bill-edit-day-note"}
            />
            {daySupported ? (
              <p className="text-xs text-muted-foreground">
                Pins this monthly bill to a fixed day (short months clamp to their last day).
              </p>
            ) : (
              <p id="bill-edit-day-note" className="text-xs text-muted-foreground">
                Day pinning applies to monthly bills only; this one repeats every{" "}
                {Math.max(1, Math.round(subscription.medianIntervalDays))} days.
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                id="bill-edit-dismiss"
                type="checkbox"
                checked={dismissed}
                onChange={(event) => setDismissed(event.target.checked)}
                className="size-4 accent-primary"
              />
              Not a bill — hide everywhere
            </label>
            <p className="text-xs text-muted-foreground">
              Dismisses this merchant from the calendar, totals, and overdue counts.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save bill</Button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
