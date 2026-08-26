import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { repositories } from "@/db/repositories"
import type { Transaction, TransactionGroup } from "@/domain/models"
import type { TransactionGroupInput } from "@/domain/repositories"
import { formatMoney } from "@/features/dashboard/format"

import { calculateGroupSummary } from "./calculations"
import { GroupEditorCard, groupColorHex } from "./group-form"

export function GroupsPageContent() {
  const data = useLiveQuery(
    async () =>
      Promise.all([
        repositories.transactionGroups.list({ includeArchived: true }),
        repositories.transactions.list(),
      ]),
    [],
  )
  const [editing, setEditing] = useState<TransactionGroup | "new" | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  async function save(draft: TransactionGroupInput) {
    const group = await repositories.transactionGroups.put(draft)
    if (group.startDate && group.endDate) {
      const transactionsInRange = (await repositories.transactions.list()).filter(
        (transaction) =>
          transaction.groupId == null &&
          transaction.date >= group.startDate! &&
          transaction.date <= group.endDate!,
      )
      if (transactionsInRange.length) {
        await repositories.transactions.updateMany(
          transactionsInRange.map((transaction) => transaction.id),
          { groupId: group.id },
        )
      }
    }
    setEditing(null)
  }

  if (!data) return <output>Loading groups…</output>
  const [groups, transactions] = data

  const membersByGroup = new Map<string, Transaction[]>()
  for (const transaction of transactions) {
    if (!transaction.groupId) continue
    const bucket = membersByGroup.get(transaction.groupId) ?? []
    bucket.push(transaction)
    membersByGroup.set(transaction.groupId, bucket)
  }

  const visible = showArchived ? groups : groups.filter((group) => !group.archived)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Groups</h1>
          <p className="mt-1 text-muted-foreground">
            Track what a vacation, project, or event really cost — including your share after
            splitting expenses.
          </p>
        </div>
        <div className="flex gap-2">
          {groups.some((group) => group.archived) && (
            <Button variant="outline" onClick={() => setShowArchived((value) => !value)}>
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          )}
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" /> New group
          </Button>
        </div>
      </div>

      {editing && (
        <GroupEditorCard
          key={editing === "new" ? "new" : editing.id}
          {...(editing === "new" ? {} : { group: editing })}
          onSubmit={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-medium">No groups yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a group for your next trip or project, then add transactions to it from the
              Transactions page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section aria-label="Transaction groups" className="grid gap-4 md:grid-cols-2">
          {visible.map((group) => {
            const members = membersByGroup.get(group.id) ?? []
            const summary = calculateGroupSummary(group, members)
            const budget = summary.budgetMinor
            const budgetProgress =
              budget !== null && budget > 0
                ? Math.min((summary.netCostMinor / budget) * 100, 100)
                : null
            return (
              <Link
                key={group.id}
                to="/groups/$groupId"
                params={{ groupId: group.id }}
                className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <Card
                  className={
                    (group.archived ? "opacity-70 " : "") +
                    "h-full cursor-pointer transition-shadow hover:shadow-md"
                  }
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="inline-block size-3 shrink-0 rounded-full"
                            style={{ backgroundColor: groupColorHex(group.color) }}
                          />
                          {group.name}
                        </CardTitle>
                        <CardDescription>
                          {group.startDate ?? "—"} → {group.endDate ?? "—"} · {summary.memberCount}{" "}
                          {summary.memberCount === 1 ? "transaction" : "transactions"}
                        </CardDescription>
                      </div>
                      {group.archived && <Badge variant="outline">archived</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Your cost</p>
                        <p className="font-semibold tabular-nums">
                          {formatMoney(summary.netCostMinor)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Gross spend</p>
                        <p className="tabular-nums">{formatMoney(summary.grossExpenseMinor)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Saved by sharing</p>
                        <p className="tabular-nums">{formatMoney(summary.savedBySharingMinor)}</p>
                      </div>
                    </div>
                    {budgetProgress !== null && (
                      <div className="grid gap-1">
                        <progress
                          aria-label={`${group.name} budget used`}
                          className="h-3 w-full accent-primary"
                          max={100}
                          value={budgetProgress}
                        />
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(summary.netCostMinor)} of{" "}
                          {budget !== null ? formatMoney(budget) : "—"} budget
                        </p>
                      </div>
                    )}
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${group.archived ? "Restore" : "Archive"} ${group.name}`}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void repositories.transactionGroups.put({
                            ...group,
                            archived: !group.archived,
                          })
                        }}
                      >
                        {group.archived ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${group.name}`}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setEditing(group)
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${group.name}`}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void repositories.transactionGroups.remove(group.id)
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
