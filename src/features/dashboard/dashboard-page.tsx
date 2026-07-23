import { useLiveQuery } from "dexie-react-hooks"
import { Upload } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { repositories } from "@/db/repositories"
import type { BudgetGoal, Transaction, WealthSnapshot } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import { ChartWorkspace } from "@/features/charts/chart-workspace"
import {
  EditableChartRenderer,
  type ChartDataRow,
  type ChartPresentationSettings,
} from "@/features/charts/render"
import { DashboardCustomizer, type DashboardModuleId } from "@/features/dashboard/customization"

import {
  calculateBudgetProgress,
  calculateCategorySpending,
  calculateMetrics,
  calculateMonthlyCashFlow,
} from "./calculations"
import { formatMoney, formatMonth } from "./format"

function today(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

function BudgetsWidget({
  goals,
  transactions,
}: {
  goals: readonly BudgetGoal[]
  transactions: readonly Transaction[]
}) {
  const progress = goals
    .slice(0, 5)
    .map((goal) => calculateBudgetProgress(goal, transactions, today()))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget progress</CardTitle>
        <CardDescription>Current period goals.</CardDescription>
      </CardHeader>
      <CardContent>
        {progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a budget goal to track category spending.
          </p>
        ) : (
          <ul className="grid gap-3">
            {progress.map((item) => (
              <li key={item.goal.id} className="flex items-center justify-between gap-4 text-sm">
                <span>
                  {item.goal.category}{" "}
                  <span className="text-muted-foreground">({item.goal.period})</span>
                </span>
                <Badge variant={item.status === "on-track" ? "secondary" : "outline"}>
                  {Math.round(item.progress * 100)}% · {formatMoney(item.spentMinor)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentWidget({ transactions }: { transactions: readonly Transaction[] }) {
  const recent = transactions.toSorted((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent transactions</CardTitle>
        <CardDescription>Latest activity by date.</CardDescription>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions imported yet.</p>
        ) : (
          <ul className="divide-y">
            {recent.map((transaction) => (
              <li className="flex justify-between gap-4 py-3 text-sm" key={transaction.id}>
                <span>
                  <span className="block font-medium">{transaction.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {transaction.date} · {transaction.category ?? "Uncategorized"}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(
                    normalizeTransactionAmountMinor(
                      transaction.amountMinor,
                      transaction.transactionType,
                    ),
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const currencyMetric = (value: number) => formatMoney(Math.round(value * 100))

function presentation(
  kind: ChartPresentationSettings["kind"],
  metricKeys: string[],
  overrides: Partial<ChartPresentationSettings> = {},
): ChartPresentationSettings {
  return {
    kind,
    barDirection: "vertical",
    metricKeys,
    palette: "default",
    labelDisplay: "none",
    labelColor: "#475569",
    legend: "bottom",
    grid: "horizontal",
    pieLabelPosition: "outside",
    areaFill: "gradient",
    animationDuration: 400,
    size: "medium",
    height: 300,
    width: { mode: "auto" },
    ...overrides,
  }
}

const financialChartMetrics = [
  {
    key: "income",
    label: "Income",
    color: "var(--chart-income)",
    formatValue: currencyMetric,
  },
  {
    key: "expenses",
    label: "Expenses",
    color: "var(--chart-expense)",
    formatValue: currencyMetric,
  },
  {
    key: "savings",
    label: "Savings",
    color: "var(--chart-savings)",
    formatValue: currencyMetric,
  },
] as const

function MetricsModule({ transactions }: { transactions: readonly Transaction[] }) {
  const metrics = calculateMetrics(transactions)
  const categories = calculateCategorySpending(transactions)
  const average =
    transactions.length === 0
      ? 0
      : transactions.reduce(
          (sum, transaction) =>
            sum +
            Math.abs(
              normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType),
            ),
          0,
        ) / transactions.length
  const uniqueMerchants = new Set(transactions.map((transaction) => transaction.description)).size
  return (
    <section aria-label="Financial summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Income"
        value={formatMoney(metrics.incomeMinor)}
        detail="Selected activity"
      />
      <MetricCard
        label="Expenses"
        value={formatMoney(metrics.expenseMinor)}
        detail="Selected activity"
      />
      <MetricCard
        label="Savings"
        value={formatMoney(metrics.savingsMinor)}
        detail={
          metrics.savingsRate === null
            ? "No income in this period"
            : `${Math.round(metrics.savingsRate * 100)}% savings rate`
        }
      />
      <MetricCard
        label="Transactions"
        value={String(metrics.transactionCount)}
        detail="Matching current filters"
      />
      <MetricCard
        label="Average transaction"
        value={formatMoney(average)}
        detail="Absolute value"
      />
      <MetricCard
        label="Highest category"
        value={categories[0]?.category ?? "—"}
        detail={categories[0] ? formatMoney(categories[0].amountMinor) : "No expenses"}
      />
      <MetricCard
        label="Categories used"
        value={String(categories.length)}
        detail="Expense categories"
      />
      <MetricCard label="Unique merchants" value={String(uniqueMerchants)} detail="Descriptions" />
    </section>
  )
}

function TotalMetricsWidget({ transactions }: { transactions: readonly Transaction[] }) {
  const totals = calculateMetrics(transactions)
  const data: ChartDataRow[] = [
    {
      id: "totals",
      label: "Selected period",
      values: {
        income: totals.incomeMinor / 100,
        expenses: totals.expenseMinor / 100,
        savings: totals.savingsMinor / 100,
      },
    },
  ]
  return (
    <EditableChartRenderer
      storageKey="budgetlens.chart.totals.v1"
      title="Total metrics"
      description="Income, expenses, and savings for the current dashboard filters."
      data={data}
      metrics={financialChartMetrics}
      initialSettings={presentation("bar", ["income", "expenses", "savings"], {
        labelDisplay: "value",
        grid: "none",
      })}
    />
  )
}

function MonthlyTrendsWidget({ transactions }: { transactions: readonly Transaction[] }) {
  const data = calculateMonthlyCashFlow(transactions).map((point) => ({
    id: point.month,
    label: formatMonth(point.month),
    values: {
      income: point.incomeMinor / 100,
      expenses: point.expenseMinor / 100,
      savings: point.savingsMinor / 100,
    },
  }))
  return (
    <EditableChartRenderer
      storageKey="budgetlens.chart.monthly-trends.v1"
      title="Monthly trends"
      description="Gradient area view inspired by the current shadcn chart patterns."
      data={data}
      metrics={financialChartMetrics}
      initialSettings={presentation("area", ["income", "expenses", "savings"], {
        size: "large",
      })}
    />
  )
}

function CategoryChartWidget({ transactions }: { transactions: readonly Transaction[] }) {
  const data = calculateCategorySpending(transactions)
    .slice(0, 10)
    .map((category) => ({
      id: category.category,
      label: category.category,
      values: { expenses: category.amountMinor / 100 },
    }))
  return (
    <EditableChartRenderer
      storageKey="budgetlens.chart.spending-by-category.v1"
      title="Spending by category"
      description="Distribution of expenses matching the current filters."
      data={data}
      metrics={[financialChartMetrics[1]]}
      initialSettings={presentation("pie", ["expenses"], {
        grid: "none",
        labelDisplay: "percent",
        pieLabelPosition: "outside",
        palette: "rainbow",
      })}
    />
  )
}

function NetWorthWidget({ wealth }: { wealth: readonly WealthSnapshot[] }) {
  const netWorth = wealth.findLast((item) => item.series === "netWorth")
  const investments = wealth.findLast((item) => item.series === "investment")
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net-worth summary</CardTitle>
        <CardDescription>Latest imported wealth observations.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">Net worth</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {netWorth ? formatMoney(netWorth.valueMinor) : "No data"}
          </p>
          {netWorth && <p className="text-xs text-muted-foreground">{netWorth.date}</p>}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Investments</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {investments ? formatMoney(investments.valueMinor) : "No data"}
          </p>
          {investments && <p className="text-xs text-muted-foreground">{investments.date}</p>}
        </div>
        <a
          className="text-sm font-medium text-primary underline underline-offset-4"
          href="/net-worth"
        >
          Open wealth dashboard
        </a>
      </CardContent>
    </Card>
  )
}

function ImportWidget() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import data</CardTitle>
        <CardDescription>Add transactions, net worth, or investment history.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href="/imports">
            <Upload className="size-4" /> Open imports
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

export interface DashboardFilters {
  query: string
  category: string
  transactionType: string
  startDate: string
  endDate: string
}

const defaultFilters: DashboardFilters = {
  query: "",
  category: "",
  transactionType: "",
  startDate: "",
  endDate: "",
}

function filterDashboardTransactions(
  transactions: readonly Transaction[],
  filters: DashboardFilters,
): Transaction[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return transactions.filter(
    (transaction) =>
      (!filters.startDate || transaction.date >= filters.startDate) &&
      (!filters.endDate || transaction.date <= filters.endDate) &&
      (!filters.category || transaction.category === filters.category) &&
      (!filters.transactionType || transaction.transactionType === filters.transactionType) &&
      (!query ||
        [
          transaction.description,
          transaction.category,
          transaction.accountName,
          transaction.provider,
        ]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLocaleLowerCase().includes(query))),
  )
}

const ALL_CATEGORIES = "__all_categories__"
const ALL_TRANSACTION_TYPES = "__all_transaction_types__"

export function DashboardFilterPanel({
  transactions,
  filters,
  onChange,
}: {
  transactions: readonly Transaction[]
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
}) {
  const categories = [
    ...new Set(
      transactions
        .map((transaction) => transaction.category)
        .filter((value): value is string => Boolean(value)),
    ),
  ].toSorted()
  const transactionTypes = [
    ...new Set(
      transactions
        .map((transaction) => transaction.transactionType)
        .filter((value): value is string => Boolean(value)),
    ),
  ].toSorted()
  const patch = (changes: Partial<DashboardFilters>) => onChange({ ...filters, ...changes })
  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <Card aria-labelledby="dashboard-filters-title">
      <CardHeader className="sr-only">
        <CardTitle id="dashboard-filters-title">Dashboard filters</CardTitle>
        <CardDescription id="dashboard-filters-description">
          Filter metrics, prebuilt charts, budgets, and recent activity.
        </CardDescription>
      </CardHeader>
      <CardContent
        className="flex flex-wrap items-end gap-2 p-3"
        aria-describedby="dashboard-filters-description"
      >
        <div className="min-w-0 basis-full sm:min-w-56 sm:flex-[2_1_16rem]">
          <Label className="sr-only" htmlFor="dashboard-search">
            Search
          </Label>
          <Input
            id="dashboard-search"
            type="search"
            className="h-8"
            value={filters.query}
            placeholder="Search merchant, category, account…"
            onChange={(event) => patch({ query: event.target.value })}
          />
        </div>
        <div className="min-w-0 flex-1 basis-[9rem]">
          <Label className="sr-only" htmlFor="dashboard-category">
            Category
          </Label>
          <Select
            id="dashboard-category"
            className="h-8"
            aria-label="Category"
            value={filters.category || ALL_CATEGORIES}
            onValueChange={(value) => patch({ category: value === ALL_CATEGORIES ? "" : value })}
            options={[
              { value: ALL_CATEGORIES, label: "All categories" },
              ...categories.map((category) => ({ value: category, label: category })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1 basis-[10rem]">
          <Label className="sr-only" htmlFor="dashboard-type">
            Transaction type
          </Label>
          <Select
            id="dashboard-type"
            className="h-8"
            aria-label="Transaction type"
            value={filters.transactionType || ALL_TRANSACTION_TYPES}
            onValueChange={(value) =>
              patch({ transactionType: value === ALL_TRANSACTION_TYPES ? "" : value })
            }
            options={[
              { value: ALL_TRANSACTION_TYPES, label: "All types" },
              ...transactionTypes.map((type) => ({ value: type, label: type })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1 basis-[9.5rem]">
          <Label className="sr-only" htmlFor="dashboard-start">
            Start date
          </Label>
          <DatePicker
            id="dashboard-start"
            className="h-8"
            aria-label="Start date"
            value={filters.startDate}
            placeholder="Start date"
            onChange={(startDate) => patch({ startDate })}
          />
        </div>
        <div className="min-w-0 flex-1 basis-[9.5rem]">
          <Label className="sr-only" htmlFor="dashboard-end">
            End date
          </Label>
          <DatePicker
            id="dashboard-end"
            className="h-8"
            aria-label="End date"
            value={filters.endDate}
            placeholder="End date"
            onChange={(endDate) => patch({ endDate })}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={!hasActiveFilters}
          onClick={() => onChange(defaultFilters)}
        >
          Reset
        </Button>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const data = useLiveQuery(
    async () =>
      Promise.all([
        repositories.transactions.list(),
        repositories.budgets.list(),
        repositories.wealth.list(),
      ]),
    [],
  )
  const [filters, setFilters] = useState(defaultFilters)
  if (!data) return <output>Loading overview…</output>
  const [transactions, goals, wealth] = data
  const visibleTransactions = filterDashboardTransactions(transactions, filters)

  const modules: Record<DashboardModuleId, React.ReactNode> = {
    metrics: <MetricsModule transactions={visibleTransactions} />,
    filters: (
      <DashboardFilterPanel transactions={transactions} filters={filters} onChange={setFilters} />
    ),
    customCharts: <ChartWorkspace transactions={visibleTransactions} wealth={wealth} />,
    categories: <CategoryChartWidget transactions={visibleTransactions} />,
    totals: <TotalMetricsWidget transactions={visibleTransactions} />,
    monthlyTrends: <MonthlyTrendsWidget transactions={visibleTransactions} />,
    transactions: <RecentWidget transactions={visibleTransactions} />,
    budgetGoals: <BudgetsWidget goals={goals} transactions={visibleTransactions} />,
    imports: <ImportWidget />,
    netWorth: <NetWorthWidget wealth={wealth} />,
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">
          Your financial picture, without sending financial data to a server.
        </p>
      </div>
      <DashboardCustomizer renderModule={({ id }) => modules[id]} />
    </div>
  )
}
