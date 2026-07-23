import { useLiveQuery } from "dexie-react-hooks"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import type { BudgetGoal } from "@/domain/models"
import { calculateBudgetProgress } from "@/features/dashboard/calculations"
import { formatMoney } from "@/features/dashboard/format"

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

function localToday(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function budgetValues(
  category: string,
  amount: string,
  period: string,
): Pick<BudgetGoal, "category" | "amountMinor" | "period"> | null {
  const numericAmount = Number(amount)
  if (
    !category.trim() ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    (period !== "monthly" && period !== "yearly")
  )
    return null
  return { category: category.trim(), amountMinor: Math.round(numericAmount * 100), period }
}

export function BudgetsPageContent() {
  const data = useLiveQuery(
    async () => Promise.all([repositories.budgets.list(), repositories.transactions.list()]),
    [],
  )
  const [referenceDate, setReferenceDate] = useState(localToday)
  const [editing, setEditing] = useState<BudgetGoal | "new" | null>(null)
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly")
  const [error, setError] = useState("")

  function begin(goal: BudgetGoal | "new") {
    setEditing(goal)
    setCategory(goal === "new" ? "" : goal.category)
    setAmount(goal === "new" ? "" : String(goal.amountMinor / 100))
    setPeriod(goal === "new" ? "monthly" : goal.period)
    setError("")
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const values = budgetValues(category, amount, period)
    if (!values) return setError("Enter a category and an amount greater than zero.")
    const now = new Date().toISOString()
    await repositories.budgets.put({
      id: editing === "new" || !editing ? crypto.randomUUID() : editing.id,
      createdAt: editing === "new" || !editing ? now : editing.createdAt,
      updatedAt: now,
      ...values,
    })
    setEditing(null)
  }

  if (!data) return <output>Loading budgets…</output>
  const [goals, transactions] = data
  const progress = goals.map((goal) => calculateBudgetProgress(goal, transactions, referenceDate))

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Budgets</h1>
          <p className="mt-1 text-muted-foreground">
            Set monthly or yearly category goals and follow your progress.
          </p>
        </div>
        <Button onClick={() => begin("new")}>
          <Plus className="size-4" /> Add goal
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Reporting date</CardTitle>
          <CardDescription>
            Choose any date in the month or year you want to review.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-xs">
          <Label htmlFor="budget-reference">Date</Label>
          <Input
            id="budget-reference"
            className="mt-1.5"
            type="date"
            value={referenceDate}
            onChange={(event) => setReferenceDate(event.target.value)}
          />
        </CardContent>
      </Card>

      {editing && (
        <Card aria-labelledby="goal-form-title">
          <CardHeader>
            <CardTitle id="goal-form-title">
              {editing === "new" ? "Add budget goal" : `Edit ${editing.category}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-3"
              onSubmit={(event) => {
                void submit(event)
              }}
              noValidate
            >
              {error && (
                <p className="text-sm text-destructive sm:col-span-3" role="alert">
                  {error}
                </p>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="goal-category">Category</Label>
                <Input
                  id="goal-category"
                  required
                  maxLength={100}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="goal-amount">Goal amount</Label>
                <Input
                  id="goal-amount"
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
                <Label htmlFor="goal-period">Period</Label>
                <select
                  id="goal-period"
                  className={selectClass}
                  value={period}
                  onChange={(event) => {
                    if (event.target.value === "monthly" || event.target.value === "yearly")
                      setPeriod(event.target.value)
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save goal</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <section aria-label="Budget goals" className="grid gap-4 md:grid-cols-2">
        {progress.length === 0 ? (
          <Card className="md:col-span-2">
            <CardContent className="p-8 text-center">
              <p className="font-medium">No budget goals yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a goal for a transaction category to start tracking progress.
              </p>
            </CardContent>
          </Card>
        ) : (
          progress.map((item) => {
            const capped = Math.min(item.progress * 100, 100)
            return (
              <Card key={item.goal.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{item.goal.category}</CardTitle>
                      <CardDescription>
                        {item.goal.period === "monthly"
                          ? referenceDate.slice(0, 7)
                          : referenceDate.slice(0, 4)}{" "}
                        · {item.goal.period}
                      </CardDescription>
                    </div>
                    <Badge variant={item.status === "on-track" ? "secondary" : "outline"}>
                      {item.status.replace("-", " ")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex justify-between text-sm">
                    <span>{formatMoney(item.spentMinor)} spent</span>
                    <span>{formatMoney(item.goal.amountMinor)} goal</span>
                  </div>
                  <progress
                    className={`h-3 w-full accent-primary ${item.status === "over-budget" ? "accent-destructive" : ""}`}
                    aria-label={`${item.goal.category} budget used`}
                    max={100}
                    value={capped}
                  />
                  <p className="text-sm">
                    {item.remainingMinor >= 0
                      ? `${formatMoney(item.remainingMinor)} remaining`
                      : `${formatMoney(Math.abs(item.remainingMinor))} over budget`}
                  </p>
                  <div className="flex justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${item.goal.category} budget`}
                      onClick={() => begin(item.goal)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${item.goal.category} budget`}
                      onClick={() => {
                        void repositories.budgets.remove(item.goal.id)
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </section>
    </div>
  )
}
