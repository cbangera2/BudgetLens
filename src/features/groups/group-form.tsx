import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TransactionGroup } from "@/domain/models"
import { GROUP_COLORS } from "@/domain/models"
import type { TransactionGroupInput } from "@/domain/repositories"
import { cn } from "@/lib/cn"

import { groupFormValues } from "./calculations"

const colorSwatch: Record<TransactionGroup["color"], string> = {
  violet: "#8b5cf6",
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  cyan: "#06b6d4",
  orange: "#f97316",
  pink: "#ec4899",
}

export function groupColorHex(color: TransactionGroup["color"]): string {
  return colorSwatch[color]
}

export function GroupEditorCard({
  group,
  onSubmit,
  onCancel,
}: {
  group?: TransactionGroup
  onSubmit: (draft: TransactionGroupInput) => Promise<void>
  onCancel: () => void
}) {
  const id = useId()
  const [name, setName] = useState(group?.name ?? "")
  const [description, setDescription] = useState(group?.description ?? "")
  const [budget, setBudget] = useState(
    group?.budgetMinor != null ? String(group.budgetMinor / 100) : "",
  )
  const [startDate, setStartDate] = useState(group?.startDate ?? "")
  const [endDate, setEndDate] = useState(group?.endDate ?? "")
  const [color, setColor] = useState<TransactionGroup["color"]>(group?.color ?? "violet")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const values = groupFormValues({ name, budget, startDate, endDate, color })
    if (!values) {
      setError("Enter a name; dates must be valid and start before end; budget must be positive.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSubmit({
        ...(group ? { id: group.id } : {}),
        description: description.trim() || null,
        archived: group?.archived ?? false,
        ...values,
      })
    } catch {
      setError("The group could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader>
        <CardTitle id={`${id}-title`}>{group ? `Edit ${group.name}` : "New group"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            void submit(event)
          }}
          noValidate
        >
          {error && (
            <p className="text-sm text-destructive sm:col-span-2 lg:col-span-3" role="alert">
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              required
              maxLength={100}
              placeholder="Vacation 2026"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-budget`}>Budget (optional)</Label>
            <Input
              id={`${id}-budget`}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="2500"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="text-sm leading-none font-medium">Color</legend>
            <div className="flex flex-wrap gap-2">
              {GROUP_COLORS.map((option) => {
                const selected = option === color
                return (
                  <button
                    key={option}
                    type="button"
                    aria-label={option}
                    aria-pressed={selected}
                    title={option}
                    onClick={() => setColor(option)}
                    className={cn(
                      "size-9 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--border)] transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected && "shadow-[0_0_0_2px_var(--ring)]",
                    )}
                    style={{ backgroundColor: colorSwatch[option] }}
                  />
                )
              })}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-start`}>Start date (optional)</Label>
            <DatePicker
              id={`${id}-start`}
              value={startDate}
              onChange={setStartDate}
              placeholder="Pick a start date"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-end`}>End date (optional)</Label>
            <DatePicker
              id={`${id}-end`}
              value={endDate}
              onChange={setEndDate}
              placeholder="Pick an end date"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-description`}>Description (optional)</Label>
            <Input
              id={`${id}-description`}
              maxLength={200}
              value={description ?? ""}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save group"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
