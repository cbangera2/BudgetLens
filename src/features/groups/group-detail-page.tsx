import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { ArrowLeft, Pencil, Trash2, UserPlus, X } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import type { TransactionGroupInput } from "@/domain/repositories"
import {
  EditableChartRenderer,
  type ChartDataRow,
  type ChartMetric,
} from "@/features/charts/render"
import { formatMoney } from "@/features/dashboard/format"

import { calculateGroupSummary, groupContributionMinor } from "./calculations"
import { GroupEditorCard, groupColorHex } from "./group-form"

function localeDate(date: string): string {
  const [yearText = "0", monthText = "1", dayText = "1"] = date.split("-")
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))))
}

const categoryChartSettings = {
  kind: "pie" as const,
  barDirection: "vertical" as const,
  metricKeys: ["amount"],
  palette: "default" as const,
  labelDisplay: "value" as const,
  labelColor: "#475569",
  legend: "right" as const,
  grid: "none" as const,
  pieLabelPosition: "outside" as const,
  areaFill: "solid" as const,
  animationDuration: 0,
  size: "medium" as const,
  height: 320,
  width: { mode: "auto" as const },
}

const dailyChartSettings = {
  kind: "area" as const,
  barDirection: "vertical" as const,
  metricKeys: ["cumulative"],
  palette: "default" as const,
  labelDisplay: "none" as const,
  labelColor: "#475569",
  legend: "bottom" as const,
  grid: "horizontal" as const,
  pieLabelPosition: "outside" as const,
  areaFill: "gradient" as const,
  animationDuration: 0,
  size: "medium" as const,
  height: 320,
  width: { mode: "auto" as const },
}

export function GroupDetailPageContent({ groupId }: { groupId: string }) {
  const data = useLiveQuery(async () => {
    const [group, transactions] = await Promise.all([
      repositories.transactionGroups.get(groupId),
      repositories.transactions.list(),
    ])
    return {
      group: group ?? null,
      members: transactions
        .filter((transaction) => transaction.groupId === groupId)
        .toSorted((left, right) => right.date.localeCompare(left.date)),
      transactions,
    }
  }, [groupId])

  const [editing, setEditing] = useState(false)
  const [rangeStart, setRangeStart] = useState("")
  const [rangeEnd, setRangeEnd] = useState("")

  const summary = useMemo(() => {
    if (!data?.group) return null
    return calculateGroupSummary(data.group, data.members)
  }, [data])

  const unassignedInRange = useMemo(() => {
    if (!data || !rangeStart || !rangeEnd || rangeStart > rangeEnd) return []
    return data.transactions.filter(
      (transaction) =>
        transaction.groupId === null &&
        transaction.date >= rangeStart &&
        transaction.date <= rangeEnd,
    )
  }, [data, rangeStart, rangeEnd])

  async function save(draft: TransactionGroupInput) {
    await repositories.transactionGroups.put(draft)
    setEditing(false)
  }

  if (!data)
    return (
      <output className="grid gap-4">
        Loading group…
        <Link to="/groups">
          <ArrowLeft className="size-4" /> Back to groups
        </Link>
      </output>
    )
  if (!data.group)
    return (
      <div className="grid gap-4">
        <p role="alert">This group no longer exists.</p>
        <Button variant="outline" asChild>
          <Link to="/groups">
            <ArrowLeft className="size-4" /> Back to groups
          </Link>
        </Button>
      </div>
    )

  const { group, members } = data
  const categoryRows: ChartDataRow[] = (summary?.byCategory ?? []).map((slice) => ({
    id: slice.category,
    label: slice.category,
    values: { amount: slice.amountMinor / 100 },
  }))
  const categoryMetrics: readonly ChartMetric[] = [
    { key: "amount", label: "Spent", color: groupColorHex(group.color) },
  ]

  const dailyRows: ChartDataRow[] = (summary?.byDay ?? []).map((point) => ({
    id: point.date,
    label: localeDate(point.date),
    values: { cumulative: point.cumulativeMinor / 100 },
  }))
  const dailyMetrics: readonly ChartMetric[] = [
    { key: "cumulative", label: "Cumulative spend", color: groupColorHex(group.color) },
  ]

  const budgetProgress =
    summary && summary.budgetMinor && summary.budgetMinor > 0
      ? Math.min((summary.netCostMinor / summary.budgetMinor) * 100, 100)
      : null

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-2 -ml-2" asChild>
            <Link to="/groups">
              <ArrowLeft className="size-4" aria-hidden="true" /> Groups
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="inline-block size-4 rounded-full"
              style={{ backgroundColor: groupColorHex(group.color) }}
            />
            {group.name}
          </h1>
          {(group.startDate || group.endDate || group.description) && (
            <p className="mt-1 text-muted-foreground">
              {[group.description, group.startDate, group.endDate].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing((value) => !value)}>
            <Pencil className="size-4" aria-hidden="true" /> Edit group
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void repositories.transactionGroups.remove(group.id).then(() => {
                window.location.assign("/groups")
              })
            }}
          >
            <Trash2 className="size-4" aria-hidden="true" /> Delete
          </Button>
        </div>
      </div>

      {editing && (
        <GroupEditorCard group={group} onSubmit={save} onCancel={() => setEditing(false)} />
      )}

      {summary && (
        <section
          aria-label="Group cost summary"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {(
            [
              ["Your net cost", formatMoney(summary.netCostMinor)],
              ["Gross spend", formatMoney(summary.grossExpenseMinor)],
              ["Saved by sharing", formatMoney(summary.savedBySharingMinor)],
              ["Refunds & credits", formatMoney(-summary.refundMinor)],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {budgetProgress !== null && summary?.budgetMinor && (
        <Card>
          <CardContent className="grid gap-2 p-5">
            <div className="flex justify-between text-sm">
              <span>{formatMoney(summary.netCostMinor)} spent</span>
              <span>{formatMoney(summary.budgetMinor)} budget</span>
            </div>
            <progress
              aria-label={`${group.name} budget used`}
              className={`h-3 w-full ${summary.netCostMinor > summary.budgetMinor ? "accent-destructive" : "accent-primary"}`}
              max={100}
              value={budgetProgress}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <EditableChartRenderer
          storageKey={`budgetlens.chart.group-${group.id}-categories.v1`}
          title="Spending by category"
          description="Your share of expenses after splits."
          settingsDescription="Choose the chart style and labels."
          data={categoryRows}
          metrics={categoryMetrics}
          initialSettings={categoryChartSettings}
        />
        <EditableChartRenderer
          storageKey={`budgetlens.chart.group-${group.id}-daily.v1`}
          title="Running cost"
          description="Cumulative share of spending over the group window."
          settingsDescription="Choose the chart style and labels."
          data={dailyRows}
          metrics={dailyMetrics}
          initialSettings={dailyChartSettings}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add transactions by date range</CardTitle>
          <CardDescription>
            Preview transactions between two dates that are not yet in any group, then add them all.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid content-start gap-3 sm:grid-cols-[auto_1fr_auto]">
          <UserPlus className="size-5 self-center text-muted-foreground" aria-hidden="true" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="range-start">From</Label>
              <Input
                id="range-start"
                type="date"
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="range-end">To</Label>
              <Input
                id="range-end"
                type="date"
                value={rangeEnd}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </div>
          </div>
          <Button
            className="self-end"
            disabled={!unassignedInRange.length}
            onClick={() => {
              void repositories.transactions
                .updateMany(
                  unassignedInRange.map((transaction) => transaction.id),
                  { groupId: group.id },
                )
                .then(() => {
                  setRangeStart("")
                  setRangeEnd("")
                })
            }}
          >
            Add {unassignedInRange.length || ""} transaction
            {unassignedInRange.length === 1 ? "" : "s"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription aria-live="polite">
            {members.length} {members.length === 1 ? "transaction" : "transactions"} ·{" "}
            {summary?.sharedCount ?? 0} shared. Shared rows count at ÷N of their amount.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="font-medium">No transactions in this group yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the date range above, or select rows on the Transactions page and choose this
                group.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm md:min-w-2xl">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 md:p-3">Date</th>
                    <th className="p-2 md:p-3">Description</th>
                    <th className="hidden p-3 sm:table-cell">Category</th>
                    <th className="p-2 text-right md:p-3">Amount</th>
                    <th className="p-2 text-right md:p-3">Your share</th>
                    <th className="p-2 md:p-3">Shared</th>
                    <th className="p-2 md:p-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((member) => {
                    const rawShare = groupContributionMinor(member)
                    return (
                      <tr key={member.id}>
                        <td className="p-2 text-xs whitespace-nowrap md:p-3">{member.date}</td>
                        <th scope="row" className="p-2 font-medium md:p-3">
                          {member.description}
                        </th>
                        <td className="hidden p-3 sm:table-cell">
                          {member.category ?? (
                            <span className="text-muted-foreground">Uncategorized</span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums md:p-3">
                          {formatMoney(member.amountMinor)}
                        </td>
                        <td className="p-2 text-right font-medium tabular-nums md:p-3">
                          {formatMoney(rawShare)}
                        </td>
                        <td className="p-2 md:p-3">
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={member.shared}
                              aria-label={`Mark ${member.description} shared`}
                              onChange={(event) => {
                                void repositories.transactions.update(member.id, {
                                  shared: event.target.checked,
                                  ...(event.target.checked
                                    ? { shareCount: member.shareCount }
                                    : {}),
                                })
                              }}
                            />
                            {member.shared && <>÷{member.shareCount}</>}
                          </label>
                          {member.shared && (
                            <input
                              type="number"
                              min={2}
                              max={10}
                              step={1}
                              className="mt-1 h-7 w-16 rounded border bg-background px-2 text-xs tabular-nums"
                              aria-label={`${member.description} split count`}
                              defaultValue={member.shareCount}
                              onChange={(event) => {
                                const parsed = Number(event.target.value)
                                if (!Number.isInteger(parsed) || parsed < 2 || parsed > 10) return
                                void repositories.transactions.update(member.id, {
                                  shared: true,
                                  shareCount: parsed,
                                })
                              }}
                            />
                          )}
                        </td>
                        <td className="p-1 md:p-3">
                          <div className="flex justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Remove ${member.description} from ${group.name}`}
                              onClick={() => {
                                void repositories.transactions.update(member.id, { groupId: null })
                              }}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
