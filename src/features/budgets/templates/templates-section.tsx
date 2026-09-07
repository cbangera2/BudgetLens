import { useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import type { BudgetGoal, Transaction } from "@/domain/models"
import { formatMoney } from "@/features/dashboard/format"

import {
  bucketTotals,
  collectExpenseWeights,
  detectMonthlyIncomeAverage,
  partitionByExisting,
  planTemplateGoals,
} from "./allocation"
import { BUDGET_TEMPLATE_PRESETS, CUSTOM_TEMPLATE_ID, validateCustomRatios } from "./presets"

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

function parseIncomeMinor(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

interface TemplatesSectionProps {
  goals: BudgetGoal[]
  transactions: Transaction[]
}

export function TemplatesSection({ goals, transactions }: TemplatesSectionProps) {
  const [incomeInput, setIncomeInput] = useState("")
  const [presetId, setPresetId] = useState<string>(
    BUDGET_TEMPLATE_PRESETS[0]?.id ?? CUSTOM_TEMPLATE_ID,
  )
  const [customNeeds, setCustomNeeds] = useState("50")
  const [customWants, setCustomWants] = useState("30")
  const [customSavings, setCustomSavings] = useState("20")
  const [period, setPeriod] = useState<BudgetGoal["period"]>("monthly")
  const [result, setResult] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const detected = useMemo(() => detectMonthlyIncomeAverage(transactions), [transactions])
  const weights = useMemo(() => collectExpenseWeights(transactions), [transactions])

  const incomeMinor = useMemo(() => parseIncomeMinor(incomeInput), [incomeInput])
  const customResult = useMemo(
    () => validateCustomRatios(customNeeds, customWants, customSavings),
    [customNeeds, customWants, customSavings],
  )
  const ratios = useMemo<[number, number, number] | null>(() => {
    if (presetId === CUSTOM_TEMPLATE_ID) return customResult.ok ? customResult.ratios : null
    const preset = BUDGET_TEMPLATE_PRESETS.find((option) => option.id === presetId)
    return preset ? [preset.needsPct, preset.wantsPct, preset.savingsPct] : null
  }, [presetId, customResult])

  const preview = useMemo(() => {
    if (incomeMinor === null || ratios === null) return null
    try {
      return planTemplateGoals({
        incomeMinor,
        needsPct: ratios[0],
        wantsPct: ratios[1],
        savingsPct: ratios[2],
        period,
        weights,
      })
    } catch {
      return null
    }
  }, [incomeMinor, ratios, period, weights])

  const buckets = useMemo(() => {
    if (incomeMinor === null || ratios === null) return null
    try {
      const [needs, wants, savings] = bucketTotals(incomeMinor, ratios[0], ratios[1], ratios[2])
      return { needs, wants, savings }
    } catch {
      return null
    }
  }, [incomeMinor, ratios])

  const partition = useMemo(
    () => (preview ? partitionByExisting(preview, goals, period) : null),
    [preview, goals, period],
  )

  const incomeError =
    incomeInput.trim() !== "" && incomeMinor === null
      ? "Enter a monthly income greater than zero."
      : null
  const unitSuffix = period === "yearly" ? "/yr" : "/mo"

  async function apply() {
    // Single-flight: the goals list refreshes asynchronously after each put,
    // so a second click before that refresh would reuse the same stale create
    // list and duplicate every goal with fresh ids.
    if (!partition || pending) return
    setApplyError(null)
    if (partition.create.length === 0) {
      const skippedNames = partition.skipped.map((goal) => goal.category).toSorted()
      setResult(
        skippedNames.length === 0
          ? "Nothing to create."
          : `Created 0 goals. Skipped ${partition.skipped.length} with an existing ${period} goal: ${skippedNames.join(", ")}.`,
      )
      return
    }
    setPending(true)
    const now = new Date().toISOString()
    try {
      for (const goal of partition.create) {
        // oxlint-disable-next-line no-await-in-loop -- Order keeps the result report stable.
        await repositories.budgets.put({
          id: crypto.randomUUID(),
          category: goal.category,
          amountMinor: goal.amountMinor,
          period: goal.period,
          createdAt: now,
          updatedAt: now,
        })
      }
    } catch {
      setApplyError("Could not create all goals. Please try again.")
      return
    } finally {
      setPending(false)
    }
    const skippedNames = partition.skipped.map((goal) => goal.category).toSorted()
    setResult(
      partition.skipped.length === 0
        ? `Created ${partition.create.length} ${partition.create.length === 1 ? "goal" : "goals"}.`
        : `Created ${partition.create.length} ${partition.create.length === 1 ? "goal" : "goals"}. Skipped ${partition.skipped.length} with an existing ${period} goal: ${skippedNames.join(", ")}.`,
    )
  }

  return (
    <Card aria-labelledby="budget-templates-title">
      <CardHeader>
        <CardTitle id="budget-templates-title">Budget templates</CardTitle>
        <CardDescription>
          Generate per-category goals from your monthly income in one click. Existing goals for the
          period are kept and reported, never duplicated.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="template-income">Monthly income</Label>
            <Input
              id="template-income"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              autoComplete="off"
              placeholder="e.g. 3000"
              value={incomeInput}
              onChange={(event) => {
                setIncomeInput(event.target.value)
                setResult(null)
              }}
            />
            {incomeError && (
              <p className="text-sm text-destructive" role="alert">
                {incomeError}
              </p>
            )}
            {detected && (
              <p className="text-sm text-muted-foreground">
                Detected {formatMoney(detected.averageMinor)}/mo across {detected.monthCount}{" "}
                {detected.monthCount === 1 ? "month" : "months"}.{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setIncomeInput(String(detected.averageMinor / 100))
                    setResult(null)
                  }}
                >
                  Use average {formatMoney(detected.averageMinor)}
                </button>
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="template-period">Goal period</Label>
            <select
              id="template-period"
              className={selectClass}
              value={period}
              onChange={(event) => {
                if (event.target.value === "monthly" || event.target.value === "yearly") {
                  setPeriod(event.target.value)
                  setResult(null)
                }
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly (× 12)</option>
            </select>
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Template</legend>
          <div className="grid gap-2" role="radiogroup" aria-label="Template">
            {BUDGET_TEMPLATE_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="rounded-lg border border-input p-3 text-sm has-checked:border-primary has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <label
                  htmlFor={`budget-template-${preset.id}`}
                  className="flex cursor-pointer items-center gap-2.5 font-medium"
                >
                  <input
                    id={`budget-template-${preset.id}`}
                    type="radio"
                    name="budget-template"
                    value={preset.id}
                    checked={presetId === preset.id}
                    onChange={() => {
                      setPresetId(preset.id)
                      setResult(null)
                    }}
                    className="accent-primary"
                  />
                  {preset.name} ({preset.needsPct}/{preset.wantsPct}/{preset.savingsPct})
                </label>
                <p className="mt-1 pl-6 text-muted-foreground">{preset.description}</p>
              </div>
            ))}
            <div className="rounded-lg border border-input p-3 text-sm has-checked:border-primary has-focus-visible:ring-2 has-focus-visible:ring-ring">
              <label
                htmlFor="budget-template-custom"
                className="flex cursor-pointer items-center gap-2.5 font-medium"
              >
                <input
                  id="budget-template-custom"
                  type="radio"
                  name="budget-template"
                  value={CUSTOM_TEMPLATE_ID}
                  checked={presetId === CUSTOM_TEMPLATE_ID}
                  onChange={() => {
                    setPresetId(CUSTOM_TEMPLATE_ID)
                    setResult(null)
                  }}
                  className="accent-primary"
                />
                Custom ratio
              </label>
              <p className="mt-1 pl-6 text-muted-foreground">
                Three whole-number percentages that add up to 100.
              </p>
              {presetId === CUSTOM_TEMPLATE_ID && (
                <span className="mt-2 grid grid-cols-3 gap-2 pl-6">
                  <span className="grid gap-1">
                    <Label htmlFor="template-custom-needs">Needs %</Label>
                    <Input
                      id="template-custom-needs"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="100"
                      step="1"
                      value={customNeeds}
                      onChange={(event) => {
                        setCustomNeeds(event.target.value)
                        setResult(null)
                      }}
                    />
                  </span>
                  <span className="grid gap-1">
                    <Label htmlFor="template-custom-wants">Wants %</Label>
                    <Input
                      id="template-custom-wants"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="100"
                      step="1"
                      value={customWants}
                      onChange={(event) => {
                        setCustomWants(event.target.value)
                        setResult(null)
                      }}
                    />
                  </span>
                  <span className="grid gap-1">
                    <Label htmlFor="template-custom-savings">Savings %</Label>
                    <Input
                      id="template-custom-savings"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="100"
                      step="1"
                      value={customSavings}
                      onChange={(event) => {
                        setCustomSavings(event.target.value)
                        setResult(null)
                      }}
                    />
                  </span>
                </span>
              )}
            </div>
          </div>
          {presetId === CUSTOM_TEMPLATE_ID && !customResult.ok && (
            <p className="text-sm text-destructive" role="alert">
              {customResult.error}
            </p>
          )}
        </fieldset>

        {preview && buckets && partition && (
          <div className="grid gap-3 rounded-lg border border-input p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Preview</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  Needs {formatMoney(buckets.needs * (period === "yearly" ? 12 : 1))}
                  {unitSuffix}
                </Badge>
                <Badge variant="secondary">
                  Wants {formatMoney(buckets.wants * (period === "yearly" ? 12 : 1))}
                  {unitSuffix}
                </Badge>
                <Badge variant="secondary">
                  Savings {formatMoney(buckets.savings * (period === "yearly" ? 12 : 1))}
                  {unitSuffix}
                </Badge>
              </div>
            </div>
            <ul aria-label="Template preview" className="grid gap-1.5 text-sm">
              {preview.map((goal) => (
                <li
                  key={goal.category}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
                >
                  <span>
                    {goal.category}
                    <span className="ml-2 text-xs text-muted-foreground">{goal.bucket}</span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(goal.amountMinor)}
                    {unitSuffix}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Spending follows your existing categories
              {weights.length === 0
                ? " (no expense history yet, so the template uses Needs, Wants, and Savings buckets)"
                : " proportionally to past spend"}
              ; uncategorized spend lands in Everything else. Total{" "}
              {formatMoney(preview.reduce((sum, goal) => sum + goal.amountMinor, 0))}
              {unitSuffix}.
              {partition.skipped.length > 0 &&
                ` ${partition.skipped.length} already ${partition.skipped.length === 1 ? "has" : "have"} a ${period} goal and will be skipped: ${partition.skipped
                  .map((goal) => goal.category)
                  .toSorted()
                  .join(", ")}.`}
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  void apply()
                }}
              >
                {pending ? "Applying…" : "Apply template"}
                {!pending && partition.create.length > 0 ? ` (${partition.create.length})` : ""}
              </Button>
            </div>
          </div>
        )}

        {applyError && (
          <p className="text-sm text-destructive" role="alert">
            {applyError}
          </p>
        )}
        {result && <output className="block text-sm">{result}</output>}
      </CardContent>
    </Card>
  )
}
