import type { BudgetLensRepositories } from "@/domain/repositories"
import type { ChatFunctionTool } from "@/features/assistant/provider"
import { formatMinor } from "@/features/assistant/provider"

export const MAX_TOOL_ROWS = 50
const MAX_DESCRIPTION_LENGTH = 60

function truncate(value: string | null, max = MAX_DESCRIPTION_LENGTH): string | null {
  if (value === null) return null
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {}
  const record: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) record[key] = entry
  return record
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === "string" && item.length > 0)
  return items.length > 0 ? items : undefined
}

function asLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.floor(value), 1), MAX_TOOL_ROWS)
    : 20
}

export const ASSISTANT_TOOL_SCHEMAS: ChatFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "spending_by_category",
      description:
        "Aggregate spending totals per category for a date range. Prefer this over raw rows.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "ISO date YYYY-MM-DD, optional" },
          endDate: { type: "string", description: "ISO date YYYY-MM-DD, optional" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "budget_status",
      description: "List budget goals with spent, remaining, and over/under status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "Search recent transactions. Descriptions are truncated and rows capped.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          startDate: { type: "string" },
          endDate: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "net_worth_trend",
      description: "Recent net worth / investment snapshots for trend questions.",
      parameters: {
        type: "object",
        properties: {
          series: { type: "string", description: "netWorth or investment, optional" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_budget_change",
      description:
        "Draft a budget change for the user to approve. Never applies it; the UI asks first.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string" },
          amountMinor: { type: "number", description: "Monthly amount in minor units (cents)" },
          period: { type: "string", description: "monthly or yearly" },
        },
        required: ["category", "amountMinor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_recategorize",
      description:
        "Draft a category change for matching transactions. Never applies it; the UI asks first.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          fromCategory: { type: "string" },
          toCategory: { type: "string" },
          limit: { type: "number" },
        },
        required: ["toCategory"],
      },
    },
  },
]

export interface BudgetProposal {
  category: string
  amountMinor: number
  period: "monthly" | "yearly"
}

export function parseBudgetProposal(args: unknown): BudgetProposal | null {
  const record = asRecord(args)
  if (typeof record.category !== "string" || !record.category.trim()) return null
  if (typeof record.amountMinor !== "number" || !Number.isFinite(record.amountMinor)) return null
  const period = record.period === "yearly" ? "yearly" : "monthly"
  return { category: record.category.trim(), amountMinor: Math.round(record.amountMinor), period }
}

export interface RecategorizeProposal {
  toCategory: string
  affectedIds: string[]
}

export function parseRecategorizeProposal(args: unknown): RecategorizeProposal | null {
  const record = asRecord(args)
  const rawCategory = asString(record.toCategory)
  const toCategory = rawCategory ? rawCategory.trim() : ""
  if (!toCategory) return null
  const rawIds = record.affectedIds
  if (!Array.isArray(rawIds)) return null
  const affectedIds = rawIds
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, MAX_TOOL_ROWS)
  if (affectedIds.length === 0) return null
  return { toCategory, affectedIds }
}

export async function executeAssistantTool(
  repositories: BudgetLensRepositories,
  name: string,
  args: unknown,
): Promise<unknown> {
  const record = asRecord(args)

  switch (name) {
    case "spending_by_category": {
      const startDate = asString(record.startDate)
      const endDate = asString(record.endDate)
      const transactions = await repositories.transactions.list({
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      })
      const buckets = new Map<string, { totalMinor: number; count: number }>()
      for (const transaction of transactions) {
        const key = transaction.category ?? "Uncategorized"
        const bucket = buckets.get(key) ?? { totalMinor: 0, count: 0 }
        bucket.totalMinor += transaction.amountMinor
        bucket.count += 1
        buckets.set(key, bucket)
      }
      return {
        buckets: [...buckets.entries()]
          .map(([category, bucket]) => ({
            category,
            count: bucket.count,
            totalMinor: bucket.totalMinor,
            total: formatMinor(bucket.totalMinor),
          }))
          .toSorted((left, right) => Math.abs(right.totalMinor) - Math.abs(left.totalMinor))
          .slice(0, 20),
        transactionCount: transactions.length,
      }
    }

    case "budget_status": {
      const [goals, transactions] = await Promise.all([
        repositories.budgets.list(),
        repositories.transactions.list(),
      ])
      return {
        goals: goals.map((goal) => {
          const spentMinor = transactions
            .filter((transaction) => transaction.category === goal.category)
            .reduce((sum, transaction) => sum + transaction.amountMinor, 0)
          const absSpent = Math.abs(spentMinor)
          return {
            category: goal.category,
            period: goal.period,
            goalMinor: goal.amountMinor,
            goal: formatMinor(goal.amountMinor),
            spentMinor: absSpent,
            spent: formatMinor(absSpent),
            remainingMinor: goal.amountMinor - absSpent,
            remaining: formatMinor(goal.amountMinor - absSpent),
            over: absSpent > goal.amountMinor,
          }
        }),
      }
    }

    case "search_transactions": {
      const limit = asLimit(record.limit)
      const search = asString(record.search)
      const categories = asStringArray(record.categories)
      const startDate = asString(record.startDate)
      const endDate = asString(record.endDate)
      const rows = await repositories.transactions.list({
        ...(search ? { search } : {}),
        ...(categories ? { categories } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      })
      return {
        total: rows.length,
        truncated: rows.length > limit,
        rows: rows.slice(0, limit).map((transaction) => ({
          date: transaction.date,
          description: truncate(transaction.description),
          amountMinor: transaction.amountMinor,
          amount: formatMinor(transaction.amountMinor),
          category: transaction.category,
        })),
      }
    }

    case "net_worth_trend": {
      const limit = asLimit(record.limit)
      const series = asString(record.series)
      const rows = await repositories.wealth.list(
        series === "netWorth" || series === "investment" ? { series: [series] } : {},
      )
      const tail = rows.slice(-limit)
      return {
        points: tail.map((snapshot) => ({
          date: snapshot.date,
          series: snapshot.series,
          valueMinor: snapshot.valueMinor,
          value: formatMinor(snapshot.valueMinor),
        })),
      }
    }

    case "propose_budget_change": {
      const proposal = parseBudgetProposal(record)
      if (!proposal) throw new Error("propose_budget_change needs category + amountMinor.")
      return {
        draft: true,
        ...proposal,
        display: `${proposal.category}: ${formatMinor(proposal.amountMinor)} ${proposal.period}`,
        note: "Awaiting user approval in the panel. Not applied.",
      }
    }

    case "propose_recategorize": {
      const rawCategory = asString(record.toCategory)
      const toCategory = rawCategory ? rawCategory.trim() : ""
      if (!toCategory) throw new Error("propose_recategorize needs toCategory.")
      const search = asString(record.search)
      const fromCategory = asString(record.fromCategory)
      const limit = asLimit(record.limit)
      const matches = await repositories.transactions.list({
        ...(search ? { search } : {}),
        ...(fromCategory ? { categories: [fromCategory] } : {}),
      })
      const totalCount = matches.length
      const affectedIds = matches
        .slice(0, limit)
        .slice(0, MAX_TOOL_ROWS)
        .map((transaction) => transaction.id)
      return {
        draft: true,
        toCategory,
        affectedIds,
        affectedCount: affectedIds.length,
        totalCount,
        truncated: totalCount > affectedIds.length,
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export const ASSISTANT_SYSTEM_PROMPT = [
  "You are BudgetLens Assistant, a local-first finance helper.",
  "Rules:",
  "- Prefer spending_by_category / budget_status aggregates over raw rows.",
  "- Never invent transactions, balances, or budget numbers; call a tool first.",
  "- Amounts are in minor units in tool I/O; show formatted currency to the user.",
  "- propose_budget_change only drafts; the UI applies it after explicit approval.",
  "- Keep answers short and point at what the user can verify in the app.",
].join("\n")

export interface SnapshotSpendingBucket {
  category: string
  count: number
  totalMinor: number
  total: string
}

export interface SnapshotBudget {
  category: string
  period: string
  goalMinor: number
  goal: string
  spentMinor: number
  spent: string
  remainingMinor: number
  remaining: string
  over: boolean
}

export interface SnapshotNetWorthPoint {
  date: string
  series: string
  valueMinor: number
  value: string
}

export interface FinanceSnapshot {
  generatedAt: string
  transactionCount: number
  spending: SnapshotSpendingBucket[]
  previousSpending: SnapshotSpendingBucket[]
  budgets: SnapshotBudget[]
  netWorth: SnapshotNetWorthPoint[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function threeMonthsAgo(): string {
  const date = new Date()
  date.setMonth(date.getMonth() - 3)
  return date.toISOString().slice(0, 10)
}

function sixMonthsAgo(): string {
  const date = new Date()
  date.setMonth(date.getMonth() - 6)
  return date.toISOString().slice(0, 10)
}

/**
 * Compact, capped finance summary built in the browser from Dexie.
 * Sent to the local harness endpoint so the agent can answer
 * without ever touching raw transaction rows.
 */
export async function buildFinanceSnapshot(
  repositories: BudgetLensRepositories,
): Promise<FinanceSnapshot> {
  const [spendingRaw, budgetsRaw, netWorthRaw] = await Promise.all([
    executeAssistantTool(repositories, "spending_by_category", { startDate: threeMonthsAgo() }),
    executeAssistantTool(repositories, "budget_status", {}),
    executeAssistantTool(repositories, "net_worth_trend", { limit: 24 }),
  ])

  const spending: SnapshotSpendingBucket[] = []
  if (isRecord(spendingRaw) && Array.isArray(spendingRaw.buckets)) {
    for (const entry of spendingRaw.buckets.slice(0, 20)) {
      if (!isRecord(entry) || typeof entry.category !== "string") continue
      spending.push({
        category: entry.category,
        count: asNumber(entry.count, 0),
        totalMinor: asNumber(entry.totalMinor, 0),
        total:
          typeof entry.total === "string"
            ? entry.total
            : formatMinor(asNumber(entry.totalMinor, 0)),
      })
    }
  }

  const budgets: SnapshotBudget[] = []
  if (isRecord(budgetsRaw) && Array.isArray(budgetsRaw.goals)) {
    for (const entry of budgetsRaw.goals.slice(0, 30)) {
      if (!isRecord(entry) || typeof entry.category !== "string") continue
      const goalMinor = asNumber(entry.goalMinor, 0)
      const spentMinor = asNumber(entry.spentMinor, 0)
      const remainingMinor = asNumber(entry.remainingMinor, goalMinor - spentMinor)
      budgets.push({
        category: entry.category,
        period: typeof entry.period === "string" ? entry.period : "monthly",
        goalMinor,
        goal: typeof entry.goal === "string" ? entry.goal : formatMinor(goalMinor),
        spentMinor,
        spent: typeof entry.spent === "string" ? entry.spent : formatMinor(spentMinor),
        remainingMinor,
        remaining:
          typeof entry.remaining === "string" ? entry.remaining : formatMinor(remainingMinor),
        over: asBoolean(entry.over),
      })
    }
  }

  const netWorth: SnapshotNetWorthPoint[] = []
  if (isRecord(netWorthRaw) && Array.isArray(netWorthRaw.points)) {
    for (const entry of netWorthRaw.points.slice(-24)) {
      if (!isRecord(entry) || typeof entry.date !== "string") continue
      const valueMinor = asNumber(entry.valueMinor, 0)
      netWorth.push({
        date: entry.date,
        series: typeof entry.series === "string" ? entry.series : "netWorth",
        valueMinor,
        value: typeof entry.value === "string" ? entry.value : formatMinor(valueMinor),
      })
    }
  }

  const transactionCount =
    isRecord(spendingRaw) && typeof spendingRaw.transactionCount === "number"
      ? spendingRaw.transactionCount
      : 0

  let previousSpending: SnapshotSpendingBucket[] = []
  try {
    const previousRaw = await executeAssistantTool(repositories, "spending_by_category", {
      startDate: sixMonthsAgo(),
      endDate: threeMonthsAgo(),
    })
    if (isRecord(previousRaw) && Array.isArray(previousRaw.buckets)) {
      const parsed: SnapshotSpendingBucket[] = []
      for (const entry of previousRaw.buckets.slice(0, 20)) {
        if (!isRecord(entry) || typeof entry.category !== "string") continue
        const totalMinor = asNumber(entry.totalMinor, 0)
        parsed.push({
          category: entry.category,
          count: asNumber(entry.count, 0),
          totalMinor,
          total: typeof entry.total === "string" ? entry.total : formatMinor(totalMinor),
        })
      }
      previousSpending = parsed
    }
  } catch {
    previousSpending = []
  }

  return {
    generatedAt: new Date().toISOString(),
    transactionCount,
    spending,
    previousSpending,
    budgets,
    netWorth,
  }
}

export function summarizeVariance(snapshot: FinanceSnapshot): string {
  const currentBuckets = Array.isArray(snapshot.spending) ? snapshot.spending : []
  const previousBuckets = Array.isArray(snapshot.previousSpending) ? snapshot.previousSpending : []
  const currentByCategory = new Map<string, number>()
  for (const bucket of currentBuckets) {
    currentByCategory.set(bucket.category, bucket.totalMinor)
  }
  const previousByCategory = new Map<string, number>()
  for (const bucket of previousBuckets) {
    previousByCategory.set(bucket.category, bucket.totalMinor)
  }
  const categories = new Set<string>([...currentByCategory.keys(), ...previousByCategory.keys()])
  const movers = [...categories]
    .map((category) => {
      const current = currentByCategory.get(category) ?? 0
      const previous = previousByCategory.get(category) ?? 0
      return { category, current, previous, delta: current - previous }
    })
    .filter((entry) => entry.delta !== 0)
    .toSorted((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 3)
  if (movers.length === 0) return "No spending changes vs prior 3 months."
  return movers
    .map(
      (entry) =>
        `- ${entry.category}: ${formatMinor(entry.previous)} → ${formatMinor(entry.current)} (${formatMinor(entry.delta)})`,
    )
    .join("\n")
}
