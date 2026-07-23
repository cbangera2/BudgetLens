import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ChartColumnBig,
  ChartNoAxesCombined,
  CircleDollarSign,
  Goal,
  Import,
  PiggyBank,
  ReceiptText,
  Search,
} from "lucide-react"

export const DASHBOARD_MODULE_IDS = [
  "metrics",
  "filters",
  "customCharts",
  "categories",
  "totals",
  "monthlyTrends",
  "transactions",
  "budgetGoals",
  "imports",
  "netWorth",
] as const

export type DashboardModuleId = (typeof DASHBOARD_MODULE_IDS)[number]
export type DashboardModuleCategory = "Analyze" | "Plan" | "Review" | "Manage"
export type DashboardModuleSpan = "half" | "full"

export interface DashboardModuleDefinition {
  id: DashboardModuleId
  title: string
  description: string
  category: DashboardModuleCategory
  defaultSpan: DashboardModuleSpan
  icon: LucideIcon
  searchTerms: readonly string[]
}

export const DASHBOARD_MODULE_CATALOG: readonly DashboardModuleDefinition[] = [
  {
    id: "metrics",
    title: "Key metrics",
    description: "Income, expenses, savings, and transaction count.",
    category: "Analyze",
    defaultSpan: "full",
    icon: Activity,
    searchTerms: ["summary", "income", "expenses", "savings"],
  },
  {
    id: "filters",
    title: "Filters and search",
    description: "Search and narrow the data shown by dashboard modules.",
    category: "Manage",
    defaultSpan: "full",
    icon: Search,
    searchTerms: ["date", "account", "category", "query"],
  },
  {
    id: "customCharts",
    title: "Custom charts",
    description: "Build and save personalized financial visualizations.",
    category: "Analyze",
    defaultSpan: "full",
    icon: ChartNoAxesCombined,
    searchTerms: ["graph", "visualization", "builder"],
  },
  {
    id: "categories",
    title: "Spending by category",
    description: "Compare spending across categories and merchants.",
    category: "Analyze",
    defaultSpan: "half",
    icon: ChartColumnBig,
    searchTerms: ["spending", "merchant", "breakdown"],
  },
  {
    id: "totals",
    title: "Total metrics",
    description: "All-time and selected-period financial totals.",
    category: "Analyze",
    defaultSpan: "half",
    icon: CircleDollarSign,
    searchTerms: ["sum", "income", "expense", "balance"],
  },
  {
    id: "monthlyTrends",
    title: "Monthly trends",
    description: "Track income, spending, and cash flow over time.",
    category: "Analyze",
    defaultSpan: "full",
    icon: ChartNoAxesCombined,
    searchTerms: ["cash flow", "history", "trend", "month"],
  },
  {
    id: "transactions",
    title: "Transactions and recent activity",
    description: "Review recent activity or a detailed transaction table.",
    category: "Review",
    defaultSpan: "full",
    icon: ReceiptText,
    searchTerms: ["table", "recent", "activity", "purchases"],
  },
  {
    id: "budgetGoals",
    title: "Budget goals",
    description: "Monitor progress toward category and period budgets.",
    category: "Plan",
    defaultSpan: "half",
    icon: Goal,
    searchTerms: ["limits", "progress", "planning"],
  },
  {
    id: "imports",
    title: "Import shortcut",
    description: "Quickly add new transaction or wealth exports.",
    category: "Manage",
    defaultSpan: "half",
    icon: Import,
    searchTerms: ["csv", "upload", "credit karma"],
  },
  {
    id: "netWorth",
    title: "Net-worth summary",
    description: "See current net worth, investments, and recent movement.",
    category: "Plan",
    defaultSpan: "half",
    icon: PiggyBank,
    searchTerms: ["wealth", "investments", "assets"],
  },
] as const

const moduleIdSet = new Set<string>(DASHBOARD_MODULE_IDS)

export function isDashboardModuleId(value: unknown): value is DashboardModuleId {
  return typeof value === "string" && moduleIdSet.has(value)
}

export function getDashboardModule(id: DashboardModuleId): DashboardModuleDefinition {
  const definition = DASHBOARD_MODULE_CATALOG.find((module) => module.id === id)
  if (!definition) throw new Error(`Unknown dashboard module: ${id}`)
  return definition
}
