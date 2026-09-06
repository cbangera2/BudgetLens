import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import type { Transaction, WealthSnapshot } from "@/domain/models"
import { shareFile } from "@/lib/native"

import { exportYearReviewPng, yearReviewFilename } from "./card-canvas"
import { availableReviewYears, buildYearReviewStats, defaultReviewYear } from "./stats"
import { YearReviewCard } from "./year-review-card"

/**
 * Overview-anchored entry point for the year-in-review share card: year
 * picker (current year plus years present in data), card preview, and PNG
 * export through the native Share sheet with web fallbacks.
 */
export function YearReviewSection({
  transactions,
  wealth,
}: {
  transactions: readonly Transaction[]
  wealth: readonly WealthSnapshot[]
}) {
  const years = useMemo(() => availableReviewYears(transactions), [transactions])
  const [selectedYear, setSelectedYear] = useState<number>(() => defaultReviewYear(transactions))
  const [busy, setBusy] = useState<"idle" | "sharing" | "downloading">("idle")
  const year = years.includes(selectedYear) ? selectedYear : (years[0] ?? selectedYear)

  const stats = useMemo(
    () => buildYearReviewStats(year, transactions, wealth),
    [year, transactions, wealth],
  )

  async function handleExport(mode: "share" | "download"): Promise<void> {
    setBusy(mode === "share" ? "sharing" : "downloading")
    try {
      const blob = await exportYearReviewPng(stats)
      const outcome = await shareFile(
        yearReviewFilename(stats.year),
        blob,
        `BudgetLens ${stats.year} in review`,
      )
      if (outcome === "downloaded") toast.success("Year-in-review image downloaded")
      else if (outcome === "copied") toast.success("Year-in-review image copied to clipboard")
      else toast.success("Year-in-review shared")
    } catch {
      toast.error("Could not export the year-in-review image")
    } finally {
      setBusy("idle")
    }
  }

  return (
    <Card aria-labelledby="year-review-title">
      <CardHeader>
        <CardTitle id="year-review-title">Year in review</CardTitle>
        <CardDescription>
          A shareable snapshot of {year}: income, spending, top categories, and net-worth movement.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            id="year-review-year"
            aria-label="Review year"
            value={String(year)}
            onValueChange={(value) => setSelectedYear(Number(value))}
            options={years.map((option) => ({ value: String(option), label: String(option) }))}
          />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy !== "idle"}
              onClick={() => void handleExport("download")}
            >
              {busy === "downloading" ? "Exporting…" : "Download PNG"}
            </Button>
            <Button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void handleExport("share")}
            >
              {busy === "sharing" ? "Preparing…" : "Share year in review"}
            </Button>
          </div>
        </div>
        <div className="flex justify-center">
          <YearReviewCard stats={stats} />
        </div>
      </CardContent>
    </Card>
  )
}
