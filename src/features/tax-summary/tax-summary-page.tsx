import { useLiveQuery } from "dexie-react-hooks"
import { Download } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import { formatMoney } from "@/features/dashboard/format"
import { downloadCsvFile } from "@/features/transactions/csv-export"

import { useTaxFlags, type TaxFlag } from "./tax-flags"
import {
  availableTaxYears,
  buildTaxExportFilename,
  buildTaxSummary,
  defaultTaxYear,
  describeTaxEmptyState,
  serializeTaxSummaryToCsv,
  unflagValue,
} from "./tax-rollup"

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const FLAG_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "Not tax-relevant" },
  { value: "deductible", label: "Deductible expense" },
  { value: "taxable", label: "Taxable income" },
  { value: "charitable", label: "Charitable giving" },
]

function flagSelectValue(flag: TaxFlag | undefined): string {
  return flag === "deductible" || flag === "taxable" || flag === "charitable" ? flag : ""
}

function parseFlagValue(value: string): TaxFlag | null {
  return value === "deductible" || value === "taxable" || value === "charitable" ? value : null
}

export function TaxSummaryPageContent() {
  const transactions = useLiveQuery(() => repositories.transactions.list(), [])
  const { flags, setFlag } = useTaxFlags()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  const years = useMemo(() => (transactions ? availableTaxYears(transactions) : []), [transactions])
  const fallbackYear = useMemo(() => defaultTaxYear(transactions ?? []), [transactions])
  const year = selectedYear ?? fallbackYear
  const yearForPicker = years.includes(year) ? year : (years[0] ?? fallbackYear)

  const summary = useMemo(
    () => buildTaxSummary(yearForPicker, transactions ?? [], flags),
    [yearForPicker, transactions, flags],
  )

  const categories = useMemo(() => {
    const names = new Set<string>()
    for (const transaction of transactions ?? []) {
      const name = transaction.category?.trim()
      if (name) names.add(name)
    }
    for (const name of Object.keys(flags)) {
      if (name.trim()) names.add(name.trim())
    }
    return [...names].toSorted((left, right) => left.localeCompare(right))
  }, [transactions, flags])

  const hasFlags = useMemo(() => Object.values(flags).some((flag) => flag !== "none"), [flags])
  const emptyState = describeTaxEmptyState(summary, hasFlags)

  if (!transactions) return <output>Loading tax summary…</output>

  function handleExport() {
    downloadCsvFile(buildTaxExportFilename(summary.year), serializeTaxSummaryToCsv(summary))
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tax summary</h1>
          <p className="mt-1 text-muted-foreground">
            Flag categories as tax-relevant, then review the yearly rollup.
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={emptyState !== null}>
          <Download className="size-4" aria-hidden="true" /> Export tax CSV
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        This is an informational summary only, not tax advice.
      </p>

      <Card aria-labelledby="tax-report-title">
        <CardHeader>
          <CardTitle id="tax-report-title">Yearly report</CardTitle>
          <CardDescription>
            Deductible expenses by category, taxable income, and the net figure for the selected
            year.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="max-w-xs">
            <Label htmlFor="tax-year">Tax year</Label>
            <select
              id="tax-year"
              className={`${selectClass} mt-1.5`}
              value={String(yearForPicker)}
              disabled={years.length === 0}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {years.length === 0 ? (
                <option value={String(fallbackYear)}>No years yet</option>
              ) : (
                years.map((option) => (
                  <option key={option} value={String(option)}>
                    {option}
                  </option>
                ))
              )}
            </select>
          </div>

          {emptyState === "no-flags" ? (
            <p className="text-sm text-muted-foreground">
              No categories are flagged yet. Flag a category as a deductible expense or taxable
              income below to build this report.
            </p>
          ) : emptyState === "empty-year" ? (
            <p className="text-sm text-muted-foreground">
              No flagged transactions in {summary.year}. Flagged categories have no activity this
              year — pick another year or flag more categories below.
            </p>
          ) : (
            <div className="grid gap-4">
              <section aria-label="Deductible expenses">
                <h3 className="text-sm font-semibold">Deductible expenses</h3>
                {summary.deductibleByCategory.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    No deductible expenses in {summary.year}.
                  </p>
                ) : (
                  <dl className="mt-2 divide-y rounded-lg border">
                    {summary.deductibleByCategory.map((entry) => (
                      <div
                        key={entry.category}
                        className="flex justify-between gap-4 px-3 py-2 text-sm"
                      >
                        <dt>{entry.category}</dt>
                        <dd className="font-medium tabular-nums">
                          {formatMoney(entry.amountMinor)}
                        </dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 px-3 py-2 text-sm font-semibold">
                      <dt>Total deductible</dt>
                      <dd className="tabular-nums">{formatMoney(summary.deductibleTotalMinor)}</dd>
                    </div>
                  </dl>
                )}
              </section>

              {summary.charitableCategories.length > 0 ? (
                <section aria-label="Charitable giving">
                  <h3 className="text-sm font-semibold">Charitable giving</h3>
                  <div className="mt-2 flex justify-between gap-4 rounded-lg border px-3 py-2 text-sm">
                    <span>{summary.charitableCategories.join(", ")}</span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(summary.charitableMinor)}
                    </span>
                  </div>
                </section>
              ) : null}

              <dl className="grid gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold">Taxable income</dt>
                  <dd className="font-medium tabular-nums">
                    {formatMoney(summary.taxableIncomeMinor)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold">Net (income minus deductions)</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(summary.netMinor)}</dd>
                </div>
              </dl>
            </div>
          )}
        </CardContent>
      </Card>

      <Card aria-labelledby="tax-flags-title">
        <CardHeader>
          <CardTitle id="tax-flags-title">Tax categories</CardTitle>
          <CardDescription>
            Flag which categories count as deductible expenses or taxable income. Categories
            matching charitable giving or donations are counted separately unless flagged otherwise.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No categories yet. Import transactions to start flagging categories.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {categories.map((category) => (
                <li key={category} className="grid gap-1.5">
                  <Label htmlFor={`tax-flag-${category}`}>{category}</Label>
                  <select
                    id={`tax-flag-${category}`}
                    aria-label={`Tax flag for ${category}`}
                    className={selectClass}
                    value={flagSelectValue(flags[category])}
                    onChange={(event) => {
                      const parsed = parseFlagValue(event.target.value)
                      if (parsed) setFlag(category, parsed)
                      else setFlag(category, unflagValue(category))
                    }}
                  >
                    {FLAG_OPTIONS.map((option) => (
                      <option key={option.value || "none"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
