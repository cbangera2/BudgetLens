import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Transaction } from "@/domain/models"
import { formatMoney } from "@/features/dashboard/format"

import {
  allocateEvenSplit,
  MAX_SPLIT_PARTS,
  MIN_SPLIT_PARTS,
  splitRemainingStatus,
  validateSplitParts,
  type SplitPartInput,
} from "./splits"

interface SplitRow {
  key: string
  category: string
  amount: string
}

function emptyRows(): SplitRow[] {
  return Array.from({ length: MIN_SPLIT_PARTS }, () => ({
    key: crypto.randomUUID(),
    category: "",
    amount: "",
  }))
}

function parseMagnitudeToMinor(raw: string): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function toReadyParts(rows: readonly SplitRow[], sign: number): SplitPartInput[] | null {
  const parts: SplitPartInput[] = []
  for (const row of rows) {
    const magnitude = parseMagnitudeToMinor(row.amount)
    const category = row.category.trim()
    if (magnitude === null || !category) return null
    parts.push({ category, amountMinor: sign * magnitude })
  }
  return parts
}

/**
 * Explicit split surface: the user assigns one category and amount per
 * part. Amounts are entered as positive magnitudes in the parent's currency
 * direction; parts must total the parent amount exactly (minor units).
 */
export function SplitDialog({
  parent,
  existingCategories,
  onClose,
  onSplit,
}: {
  parent: Transaction
  existingCategories: readonly string[]
  onClose: () => void
  onSplit: (parts: SplitPartInput[]) => Promise<void>
}) {
  const [rows, setRows] = useState<SplitRow[]>(() => {
    const initial = emptyRows()
    const [first] = initial
    if (parent.category && first) initial[0] = { ...first, category: parent.category }
    return initial
  })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const sign = Math.sign(parent.amountMinor) || 1
  const readyParts = toReadyParts(rows, sign)
  const validationError =
    readyParts === null
      ? "Enter a category and a positive amount for every part."
      : validateSplitParts(parent, readyParts)
  const enteredTotal = (readyParts ?? []).reduce((sum, part) => sum + part.amountMinor, 0)
  const remaining = parent.amountMinor - enteredTotal
  const remainingStatus = splitRemainingStatus(parent.amountMinor, enteredTotal)

  function setRow(index: number, patch: Partial<SplitRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    )
  }

  function splitEvenly() {
    const amounts = allocateEvenSplit(parent.amountMinor, rows.length)
    setRows((current) =>
      current.map((row, index) => ({
        ...row,
        amount: (Math.abs(amounts[index] ?? 0) / 100).toFixed(2),
      })),
    )
  }

  async function submit() {
    if (validationError) return setError(validationError)
    setSaving(true)
    setError("")
    try {
      await onSplit(readyParts ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The split could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Splitting {formatMoney(parent.amountMinor)} across {rows.length} categories. Parts must
        total exactly {formatMoney(parent.amountMinor)}; the original row is kept underneath and
        restored if you unsplit.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={splitEvenly}>
          Split evenly
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={rows.length <= MIN_SPLIT_PARTS}
          onClick={() => setRows((current) => current.slice(0, -1))}
        >
          Remove part
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={rows.length >= MAX_SPLIT_PARTS}
          onClick={() =>
            setRows((current) => [
              ...current,
              { key: crypto.randomUUID(), category: "", amount: "" },
            ])
          }
        >
          Add part
        </Button>
      </div>
      <div className="grid gap-3">
        {rows.map((row, index) => (
          <fieldset key={row.key} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Part {index + 1}
            </legend>
            <div className="grid gap-1.5">
              <Label htmlFor={`split-category-${index}`}>Category for part {index + 1}</Label>
              <Input
                id={`split-category-${index}`}
                maxLength={100}
                autoComplete="off"
                list="split-category-options"
                value={row.category}
                onChange={(event) => setRow(index, { category: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`split-amount-${index}`}>Amount for part {index + 1}</Label>
              <Input
                id={`split-amount-${index}`}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={row.amount}
                onChange={(event) => setRow(index, { amount: event.target.value })}
              />
            </div>
          </fieldset>
        ))}
      </div>
      <datalist id="split-category-options">
        {existingCategories.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </datalist>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Entered {formatMoney(enteredTotal)}
        {remainingStatus === "balanced"
          ? " · balanced"
          : ` · ${formatMoney(Math.abs(remaining))} ${remainingStatus === "left" ? "left to assign" : "over"}`}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={saving || validationError !== null}
          onClick={() => void submit()}
        >
          {saving ? "Splitting…" : "Split transaction"}
        </Button>
      </div>
    </div>
  )
}
