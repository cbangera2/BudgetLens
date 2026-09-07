import type { BudgetLensRepositories } from "@/domain/repositories"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"
import type { BudgetLensChartSpec } from "@/features/assistant/chart-block"
import { parseBudgetLensChartSpec } from "@/features/assistant/chart-block"
import type { ChatFunctionTool } from "@/features/assistant/provider"
import { formatMinor } from "@/features/assistant/provider"
import type { ChartConfigurationInput } from "@/features/charts/model"

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
      description:
        "List budget goals with spent, remaining, and over/under status. Capped at 50 goals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transactions",
      description:
        "Search transactions with optional amount sorting. Descriptions are truncated and rows capped.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          startDate: { type: "string" },
          endDate: { type: "string" },
          limit: { type: "number" },
          sortBy: {
            type: "string",
            description:
              "recent (default), amountDesc for largest first, amountAsc for smallest first",
          },
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
  {
    type: "function",
    function: {
      name: "create_transaction",
      description:
        "Draft a new manual transaction for the user to approve. Never applies it; the UI asks first. Amount in minor units (cents), negative for expenses.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "ISO date YYYY-MM-DD" },
          description: { type: "string" },
          amountMinor: { type: "number", description: "Minor units, negative for expenses" },
          category: { type: "string" },
          accountName: { type: "string" },
          notes: { type: "string" },
        },
        required: ["date", "description", "amountMinor"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_transaction",
      description:
        "Draft deletion of one transaction (by id, from search results) for the user to approve. Never applies it; the UI asks first.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transaction id from a search_transactions row" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_transactions_view",
      description:
        "Switch the app's Transactions view to the given filters so the user can see matching rows. No approval needed. Use after answering row questions or when the user asks to see/filter transactions.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          sort: {
            type: "string",
            description: "date-desc, date-asc, amount-desc, amount-asc, or description",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_transaction",
      description:
        "Parse natural-language adds like 'spent $12 on coffee yesterday' into a draft transaction with amount, merchant, date, and category guess. Never applies it; the UI asks first.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Natural language, e.g. 'spent $12 on coffee yesterday'",
          },
          today: {
            type: "string",
            description: "ISO date YYYY-MM-DD reference for relative dates",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_chart",
      description:
        "Draft persisting the current answer's chart spec into dashboard saved charts. Never applies it; the UI asks first. Spec matches the budgetlens-chart fence shape.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          type: { type: "string", description: "bar, donut, or line" },
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "number" },
              },
            },
          },
          unit: { type: "string" },
          spec: {
            type: "object",
            description: "Alternative wrapper holding title/type/data/unit together",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_spending_anomalies",
      description:
        "Flag categories whose current-month spend deviates from the trailing average by a threshold. Read-only; answer in text with amounts from the result.",
      parameters: {
        type: "object",
        properties: {
          thresholdPct: {
            type: "number",
            description: "Minimum absolute percent change to flag, e.g. 50 for 50%",
          },
          trailingMonths: { type: "number", description: "Trailing months for the average, 1-12" },
          minSpendMinor: {
            type: "number",
            description: "Ignore categories where current and average are both below this (cents)",
          },
          referenceDate: { type: "string", description: "ISO date YYYY-MM-DD, defaults to today" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description:
        "Compare this-month vs last-month spend for one category. Composes existing aggregates; no storage. Read-only; answer in text.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string" },
          referenceDate: { type: "string", description: "ISO date YYYY-MM-DD, defaults to today" },
        },
        required: ["category"],
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

export interface CreateTransactionProposal {
  date: string
  description: string
  amountMinor: number
  category: string | null
  accountName: string | null
  notes: string | null
}

function asOptionalText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export function parseCreateTransactionProposal(args: unknown): CreateTransactionProposal | null {
  const record = asRecord(args)
  const date = asString(record.date)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const description = asOptionalText(record.description)
  if (!description) return null
  const amountMinor = record.amountMinor
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) return null
  return {
    date,
    description,
    amountMinor: Math.round(amountMinor),
    category: asOptionalText(record.category, 120),
    accountName: asOptionalText(record.accountName, 120),
    notes: asOptionalText(record.notes, 500),
  }
}

export interface DeleteTransactionProposal {
  id: string
  preview: string
}

export function parseDeleteTransactionProposal(args: unknown): DeleteTransactionProposal | null {
  const record = asRecord(args)
  const id = asString(record.id)
  if (!id) return null
  const preview = asOptionalText(record.preview, 160) ?? id
  return { id, preview }
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
      // Mirror the app's own progress math (calculateBudgetProgress): only
      // expense-side amounts in the goal's current calendar period count.
      const referenceDate = new Date().toISOString().slice(0, 10)
      return {
        totalCount: goals.length,
        truncated: goals.length > MAX_TOOL_ROWS,
        goals: goals.slice(0, MAX_TOOL_ROWS).map((goal) => {
          const periodPrefix =
            goal.period === "monthly" ? referenceDate.slice(0, 7) : referenceDate.slice(0, 4)
          const spentMinor = transactions
            .filter(
              (transaction) =>
                transaction.category === goal.category &&
                transaction.date.startsWith(periodPrefix) &&
                normalizeTransactionAmountMinor(
                  transaction.amountMinor,
                  transaction.transactionType,
                ) < 0,
            )
            .reduce(
              (sum, transaction) =>
                sum +
                Math.abs(
                  normalizeTransactionAmountMinor(
                    transaction.amountMinor,
                    transaction.transactionType,
                  ),
                ),
              0,
            )
          return {
            category: goal.category,
            period: goal.period,
            goalMinor: goal.amountMinor,
            goal: formatMinor(goal.amountMinor),
            spentMinor,
            spent: formatMinor(spentMinor),
            remainingMinor: goal.amountMinor - spentMinor,
            remaining: formatMinor(goal.amountMinor - spentMinor),
            over: spentMinor > goal.amountMinor,
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
      const sortBy = asString(record.sortBy)
      const rows = await repositories.transactions.list({
        ...(search ? { search } : {}),
        ...(categories ? { categories } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      })
      const ordered =
        sortBy === "amountDesc"
          ? rows.toSorted((left, right) => Math.abs(right.amountMinor) - Math.abs(left.amountMinor))
          : sortBy === "amountAsc"
            ? rows.toSorted(
                (left, right) => Math.abs(left.amountMinor) - Math.abs(right.amountMinor),
              )
            : rows
      return {
        total: rows.length,
        truncated: rows.length > limit,
        rows: ordered.slice(0, limit).map((transaction) => ({
          id: transaction.id,
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

    case "create_transaction": {
      const draft = parseCreateTransactionProposal(record)
      if (!draft) throw new Error("create_transaction needs date, description, amountMinor.")
      return {
        draft: true,
        kind: "create_transaction",
        ...draft,
        display: `${draft.date} · ${draft.description} · ${formatMinor(draft.amountMinor)}`,
        note: "Awaiting user approval in the panel. Not applied.",
      }
    }

    case "delete_transaction": {
      const parsed = parseDeleteTransactionProposal(record)
      if (!parsed) throw new Error("delete_transaction needs id.")
      const existing = await repositories.transactions.get(parsed.id)
      if (!existing) throw new Error("Transaction not found; search again for a valid id.")
      const preview = `${existing.date} · ${existing.description} · ${formatMinor(existing.amountMinor)}`
      return { draft: true, kind: "delete_transaction", id: parsed.id, preview }
    }

    case "propose_transaction": {
      const draft = parseProposeTransaction(record)
      if (!draft)
        throw new Error(
          "propose_transaction needs text with an amount, e.g. 'spent $12 on coffee yesterday'.",
        )
      return {
        draft: true,
        kind: "propose_transaction",
        ...draft,
        display: `${draft.date} · ${draft.description} · ${formatMinor(draft.amountMinor)}`,
        note: "Awaiting user approval in the panel. Not applied.",
      }
    }

    case "save_chart": {
      const proposal = parseSaveChartProposal(record)
      if (!proposal)
        throw new Error("save_chart needs a valid chart spec (title, type bar|donut|line, data).")
      return {
        draft: true,
        kind: "save_chart",
        spec: proposal.spec,
        display: `${proposal.spec.title} · ${proposal.spec.type} · ${proposal.spec.data.length} points`,
        note: "Awaiting user approval in the panel. Not applied.",
      }
    }

    case "detect_spending_anomalies": {
      return await detectSpendingAnomalies(repositories, record)
    }

    case "compare_periods": {
      return await comparePeriodSpend(repositories, record)
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
  "- propose_budget_change, propose_recategorize, create_transaction, delete_transaction, propose_transaction, save_chart only draft; the UI applies them after explicit approval.",
  "- propose_transaction parses natural-language adds (e.g. 'spent $12 on coffee yesterday'); save_chart persists the current answer's chart spec to the dashboard.",
  "- detect_spending_anomalies flags current-month categories deviating from the trailing average; compare_periods compares this-month vs last-month for one category; both are read-only aggregates for answer text.",
  "- Use show_transactions_view to display matching rows in the app after row answers.",
  '- When the user asks for a graph, chart, or visual breakdown, render one with a fenced block: ```budgetlens-chart on its own line, then JSON {"type":"bar"|"donut"|"line","title":string,"unit"?:string,"data":[{"label":string,"value":number}]}, then a closing ``` fence. Rules: 1..12 slices, finite values only, labels and numbers strictly from tool results above (never invent them), never nest it inside another code block. Use "line" for trends over time (points render left-to-right in the order given, so list them oldest-to-newest, up to 12 representative points); "bar" or "donut" for breakdowns and comparisons.',
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

export interface SnapshotTransaction {
  id: string
  date: string
  description: string | null
  amountMinor: number
  amount: string
  category: string | null
}

export interface SnapshotExtremes {
  largestExpense: SnapshotTransaction | null
  largestIncome: SnapshotTransaction | null
}

export interface SnapshotDayPoint {
  date: string
  spent: string
  spentMinor: number
  income: string
  incomeMinor: number
  count: number
}

export interface FinanceSnapshot {
  generatedAt: string
  transactionCount: number
  spending: SnapshotSpendingBucket[]
  previousSpending: SnapshotSpendingBucket[]
  budgets: SnapshotBudget[]
  netWorth: SnapshotNetWorthPoint[]
  extremes: SnapshotExtremes
  topTransactions: SnapshotTransaction[]
  dailySeries: SnapshotDayPoint[]
  recentTransactions: SnapshotTransaction[]
}

export const MAX_SNAPSHOT_TOP_ROWS = 25
export const MAX_SNAPSHOT_RECENT_ROWS = 60

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
 * Sent to the local harness endpoint so the agent can answer.
 * Aggregates first; individual rows are limited to the top 25 by absolute
 * amount with truncated descriptions.
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

  let extremes: SnapshotExtremes = { largestExpense: null, largestIncome: null }
  let topTransactions: SnapshotTransaction[] = []
  let dailySeries: SnapshotDayPoint[] = []
  let recentTransactions: SnapshotTransaction[] = []
  try {
    const all = await repositories.transactions.list()
    const ninetyDaysAgo = (() => {
      const date = new Date()
      date.setDate(date.getDate() - 90)
      return date.toISOString().slice(0, 10)
    })()
    const byDay = new Map<string, { spentMinor: number; incomeMinor: number; count: number }>()
    for (const transaction of all) {
      if (transaction.date < ninetyDaysAgo) continue
      const bucket = byDay.get(transaction.date) ?? { spentMinor: 0, incomeMinor: 0, count: 0 }
      if (transaction.amountMinor < 0) bucket.spentMinor += Math.abs(transaction.amountMinor)
      else bucket.incomeMinor += transaction.amountMinor
      bucket.count += 1
      byDay.set(transaction.date, bucket)
    }
    dailySeries = [...byDay.entries()]
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([date, bucket]) => ({
        date,
        spent: formatMinor(bucket.spentMinor),
        spentMinor: bucket.spentMinor,
        income: formatMinor(bucket.incomeMinor),
        incomeMinor: bucket.incomeMinor,
        count: bucket.count,
      }))
    const toSnapshotRow = (transaction: {
      id: string
      date: string
      description: string
      amountMinor: number
      category: string | null
    }): SnapshotTransaction => ({
      id: transaction.id,
      date: transaction.date,
      description: truncate(transaction.description),
      amountMinor: transaction.amountMinor,
      amount: formatMinor(transaction.amountMinor),
      category: transaction.category,
    })
    const byAbs = [...all].toSorted(
      (left, right) => Math.abs(right.amountMinor) - Math.abs(left.amountMinor),
    )
    topTransactions = byAbs.slice(0, MAX_SNAPSHOT_TOP_ROWS).map(toSnapshotRow)
    const expenses = all.filter((transaction) => transaction.amountMinor < 0)
    const income = all.filter((transaction) => transaction.amountMinor > 0)
    const largestExpenseRow = expenses.toSorted(
      (left, right) => left.amountMinor - right.amountMinor,
    )[0]
    const largestIncomeRow = income.toSorted(
      (left, right) => right.amountMinor - left.amountMinor,
    )[0]
    extremes = {
      largestExpense: largestExpenseRow ? toSnapshotRow(largestExpenseRow) : null,
      largestIncome: largestIncomeRow ? toSnapshotRow(largestIncomeRow) : null,
    }
    recentTransactions = [...all]
      .toSorted((left, right) => right.date.localeCompare(left.date))
      .slice(0, MAX_SNAPSHOT_RECENT_ROWS)
      .map(toSnapshotRow)
  } catch {
    extremes = { largestExpense: null, largestIncome: null }
    topTransactions = []
    dailySeries = []
    recentTransactions = []
  }

  return {
    generatedAt: new Date().toISOString(),
    transactionCount,
    spending,
    previousSpending,
    budgets,
    netWorth,
    extremes,
    topTransactions,
    recentTransactions,
    dailySeries,
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

// --- Assistant capabilities batch: NL add, save chart, anomaly, compare (append-only) ---

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function toISODateUTC(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseReferenceDate(value: unknown): string {
  if (typeof value === "string" && ISO_DATE_PATTERN.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value) {
      return value
    }
  }
  return new Date().toISOString().slice(0, 10)
}

function shiftISODate(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return toISODateUTC(base)
}

function shiftISOMonth(iso: string, months: number): string {
  const base = new Date(`${iso}T00:00:00.000Z`)
  const day = base.getUTCDate()
  base.setUTCDate(1)
  base.setUTCMonth(base.getUTCMonth() + months)
  const daysInMonth = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate()
  base.setUTCDate(Math.min(day, daysInMonth))
  return toISODateUTC(base)
}

function isIncomeCue(text: string): boolean {
  return /\b(received|earned|got paid|paycheck|income|refund|reimbursed|reimbursement|deposit|paid me)\b/i.test(
    text,
  )
}

export interface ProposeTransactionAmount {
  amountMinor: number
  matched: string
}

export function parseProposeTransactionAmount(text: string): ProposeTransactionAmount | null {
  const dollar = text.match(/([+-]?)\s*\$\s*(\d[\d,]*(?:\.\d{1,2})?)/)
  if (dollar) {
    const raw = (dollar[2] ?? "").replaceAll(",", "")
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) return null
    let minor = Math.round(value * 100)
    const sign = dollar[1] ?? ""
    if (sign === "-") minor = -Math.abs(minor)
    else if (sign === "+") minor = Math.abs(minor)
    else minor = isIncomeCue(text) ? Math.abs(minor) : -Math.abs(minor)
    return { amountMinor: minor, matched: dollar[0] }
  }
  const words = text.match(/([+-]?)\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(dollars?|bucks?|usd)\b/i)
  if (words) {
    const raw = (words[2] ?? "").replaceAll(",", "")
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) return null
    let minor = Math.round(value * 100)
    const sign = words[1] ?? ""
    if (sign === "-") minor = -Math.abs(minor)
    else if (sign === "+") minor = Math.abs(minor)
    else minor = isIncomeCue(text) ? Math.abs(minor) : -Math.abs(minor)
    return { amountMinor: minor, matched: words[0] }
  }
  return null
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

export function resolveProposeTransactionDate(text: string, referenceDate: string): string {
  const reference = parseReferenceDate(referenceDate)
  const isoInText = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoInText) {
    const candidate = isoInText[1] ?? ""
    if (ISO_DATE_PATTERN.test(candidate)) {
      const parsed = new Date(`${candidate}T00:00:00.000Z`)
      if (!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === candidate) {
        return candidate
      }
    }
  }
  const lower = text.toLowerCase()
  if (lower.includes("day before yesterday")) return shiftISODate(reference, -2)
  if (lower.includes("yesterday")) return shiftISODate(reference, -1)
  if (lower.includes("tomorrow")) return shiftISODate(reference, 1)
  if (lower.includes("today")) return reference
  const daysAgo = lower.match(/(\d+)\s+days?\s+ago/)
  if (daysAgo) {
    const count = Number.parseInt(daysAgo[1] ?? "0", 10)
    if (Number.isFinite(count)) return shiftISODate(reference, -Math.min(count, 3650))
  }
  const weeksAgo = lower.match(/(\d+)\s+weeks?\s+ago/)
  if (weeksAgo) {
    const count = Number.parseInt(weeksAgo[1] ?? "0", 10)
    if (Number.isFinite(count)) return shiftISODate(reference, -Math.min(count, 520) * 7)
  }
  if (lower.includes("last month")) return shiftISOMonth(reference, -1)
  if (lower.includes("last week")) return shiftISODate(reference, -7)
  for (const [name, target] of Object.entries(WEEKDAYS)) {
    if (lower.includes(`last ${name}`)) {
      const ref = new Date(`${reference}T00:00:00.000Z`)
      const diff = (ref.getUTCDay() - target + 7) % 7
      return shiftISODate(reference, -(diff === 0 ? 7 : diff))
    }
  }
  for (const [name, target] of Object.entries(WEEKDAYS)) {
    const pattern = new RegExp(`\\b${name}\\b`)
    if (pattern.test(lower)) {
      const ref = new Date(`${reference}T00:00:00.000Z`)
      const diff = (ref.getUTCDay() - target + 7) % 7
      return shiftISODate(reference, -diff)
    }
  }
  const monthDay = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  )
  if (monthDay) {
    const month = MONTH_NAMES[monthDay[1] ?? ""]
    const day = Number.parseInt(monthDay[2] ?? "0", 10)
    if (month !== undefined && Number.isFinite(day) && day >= 1 && day <= 31) {
      const year = Number.parseInt(reference.slice(0, 4), 10)
      const candidate = new Date(Date.UTC(year, month, day))
      if (candidate.getUTCMonth() === month) {
        const iso = toISODateUTC(candidate)
        return iso > reference ? shiftISOMonth(iso, -12) : iso
      }
    }
  }
  const numericDay = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (numericDay) {
    const first = Number.parseInt(numericDay[1] ?? "0", 10)
    const second = Number.parseInt(numericDay[2] ?? "0", 10)
    const yearPart = numericDay[3]
    if (Number.isFinite(first) && Number.isFinite(second)) {
      const year =
        yearPart !== undefined
          ? yearPart.length === 2
            ? 2000 + Number.parseInt(yearPart, 10)
            : Number.parseInt(yearPart, 10)
          : Number.parseInt(reference.slice(0, 4), 10)
      if (Number.isFinite(year) && first >= 1 && first <= 12 && second >= 1 && second <= 31) {
        const candidate = new Date(Date.UTC(year, first - 1, second))
        if (candidate.getUTCMonth() === first - 1) {
          const iso = toISODateUTC(candidate)
          if (yearPart === undefined && iso > reference) return shiftISOMonth(iso, -12)
          return iso
        }
      }
    }
  }
  return reference
}

const LEADING_FILLER = /^\s*(i|we|just|please|hey|hi)\b\s*/i
const LEADING_VERBS =
  /^\s*(spent|paid|bought|purchased|added|add|log|logged|received|earned|got|send|sent|record|created?|made|charged?)\b\s*/i
const LEADING_PREPOSITION = /^\s*(on|for|at|from|to|of|in|yesterday|today|tomorrow)\b\s*/i

export function extractProposeTransactionDescription(
  text: string,
  amountMatched: string | null,
): string {
  let working = ` ${text} `
  if (amountMatched) working = working.replace(amountMatched, " ")
  working = working
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\bday before yesterday\b/gi, " ")
    .replace(/\byesterday\b/gi, " ")
    .replace(/\btoday\b/gi, " ")
    .replace(/\btomorrow\b/gi, " ")
    .replace(/\b\d+\s+days?\s+ago\b/gi, " ")
    .replace(/\b\d+\s+weeks?\s+ago\b/gi, " ")
    .replace(/\blast\s+(week|month)\b/gi, " ")
    .replace(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
    .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
    .replace(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi,
      " ",
    )
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\$\s*/g, " ")
    .replace(/\b(dollars?|bucks?|usd)\b/gi, " ")
  for (let step = 0; step < 6; step += 1) {
    const before = working
    working = working
      .replace(LEADING_FILLER, " ")
      .replace(LEADING_VERBS, " ")
      .replace(LEADING_PREPOSITION, " ")
      .replace(/^\s*[,.;:!?-]+\s*/, " ")
    if (working === before) break
  }
  const cleaned = working
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[,.;:!?-]+\s*$/, "")
    .trim()
  if (!cleaned) return "Manual entry"
  return cleaned.slice(0, 200)
}

const CATEGORY_KEYWORDS: Array<{ category: string; patterns: RegExp }> = [
  {
    category: "Dining Out",
    patterns:
      /\b(coffee|latte|espresso|cappuccino|starbucks|cafe|restaurant|lunch|dinner|breakfast|brunch|pizza|burger|sushi|taco|dining|takeout|doordash|uber\s*eats|bar|pub|bakery|deli)\b/i,
  },
  {
    category: "Groceries",
    patterns:
      /\b(grocer(y|ies)|supermarket|whole\s*foods|trader\s*joe|safeway|kroger|aldi|costco|market\s*run|produce)\b/i,
  },
  {
    category: "Transport",
    patterns:
      /\b(gas|fuel|uber|lyft|taxi|bus|subway|metro|train|parking|toll|shell|chevron|transit|fare)\b/i,
  },
  {
    category: "Travel",
    patterns: /\b(flight|airline|hotel|airbnb|travel|vacation|trip|boarding)\b/i,
  },
  { category: "Housing", patterns: /\b(rent|mortgage|landlord|housing)\b/i },
  {
    category: "Utilities",
    patterns: /\b(electric|water|internet|phone|utility|utilities|comcast|power\s*bill)\b/i,
  },
  {
    category: "Entertainment",
    patterns:
      /\b(movie|cinema|netflix|spotify|hulu|disney|game|concert|entertainment|theater|theatre)\b/i,
  },
  {
    category: "Health",
    patterns: /\b(doctor|dentist|pharmacy|cvs|walgreens|health|gym|prescription|clinic)\b/i,
  },
  { category: "Income", patterns: /\b(paycheck|salary|income|refund|reimbursement|deposit)\b/i },
]

export function guessProposeTransactionCategory(description: string): string | null {
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.patterns.test(description)) return entry.category
  }
  return null
}

export interface ProposeTransactionProposal {
  date: string
  description: string
  amountMinor: number
  category: string | null
  accountName: string | null
  notes: string | null
}

export function parseProposeTransaction(args: unknown): ProposeTransactionProposal | null {
  const record = asRecord(args)
  const draftDate = typeof record.date === "string" ? record.date : undefined
  const draftDescription =
    typeof record.description === "string" ? record.description.trim() : undefined
  const draftAmount = record.amountMinor
  if (draftDate && draftDescription && typeof draftAmount === "number") {
    if (!ISO_DATE_PATTERN.test(draftDate)) return null
    if (!Number.isFinite(draftAmount)) return null
    return {
      date: draftDate,
      description: draftDescription.slice(0, 200),
      amountMinor: Math.round(draftAmount),
      category: asOptionalText(record.category, 120),
      accountName: asOptionalText(record.accountName, 120),
      notes: asOptionalText(record.notes, 500),
    }
  }
  const rawText = typeof record.text === "string" ? record.text.trim() : ""
  if (!rawText) return null
  const reference = parseReferenceDate(record.today ?? record.referenceDate)
  const amount = parseProposeTransactionAmount(rawText)
  if (!amount) return null
  const date = resolveProposeTransactionDate(rawText, reference)
  const description = extractProposeTransactionDescription(rawText, amount.matched)
  if (!description) return null
  const overrideCategory =
    typeof record.category === "string" && record.category.trim()
      ? record.category.trim().slice(0, 120)
      : null
  return {
    date,
    description,
    amountMinor: amount.amountMinor,
    category: overrideCategory ?? guessProposeTransactionCategory(description),
    accountName: asOptionalText(record.accountName, 120),
    notes: asOptionalText(record.notes, 500),
  }
}

export interface SaveChartProposal {
  spec: BudgetLensChartSpec
}

export function parseSaveChartProposal(args: unknown): SaveChartProposal | null {
  const record = asRecord(args)
  const candidate: unknown = isRecord(record.spec) ? record.spec : record
  const parsed = parseBudgetLensChartSpec(candidate)
  if (!parsed) return null
  return { spec: { ...parsed, data: [...parsed.data] } }
}

export function buildDashboardChartInputFromSaveChart(
  spec: BudgetLensChartSpec,
  id: string,
): ChartConfigurationInput {
  const type = spec.type === "donut" ? "pie" : spec.type === "line" ? "line" : "bar-vertical"
  if (spec.type === "line") {
    const isoLabels = spec.data
      .map((point) => point.label)
      .filter((label) => /^\d{4}-\d{2}-\d{2}$/.test(label))
      .toSorted()
    if (isoLabels.length >= 2) {
      const start = isoLabels[0] ?? ""
      const end = isoLabels[isoLabels.length - 1] ?? ""
      return {
        id,
        title: spec.title,
        type,
        metrics: ["expenses"],
        valueDisplay: "value",
        filters: { categories: [], descriptions: [], transactionTypes: [], date: { start, end } },
      }
    }
    return {
      id,
      title: spec.title,
      type,
      metrics: ["expenses"],
      valueDisplay: "value",
      filters: { categories: [], descriptions: [], transactionTypes: [], date: {} },
    }
  }
  const categories = [
    ...new Set(spec.data.map((point) => point.label.trim()).filter(Boolean)),
  ].slice(0, 100)
  return {
    id,
    title: spec.title,
    type,
    metrics: ["expenses"],
    valueDisplay: "value",
    filters: { categories, descriptions: [], transactionTypes: [], date: {} },
  }
}

export interface SpendingAnomaly {
  category: string
  currentMinor: number
  averageMinor: number
  changePct: number | null
  current: string
  average: string
  direction: "spike" | "drop" | "new"
}

export interface AnomalyOptions {
  thresholdPct: number
  trailingMonths: number
  minSpendMinor: number
  referenceDate: string
}

export function parseAnomalyOptions(args: unknown): AnomalyOptions {
  const record = asRecord(args)
  const rawThreshold = record.thresholdPct
  const thresholdPct =
    typeof rawThreshold === "number" && Number.isFinite(rawThreshold) && rawThreshold > 0
      ? Math.min(rawThreshold, 10000)
      : 50
  const rawTrailing = record.trailingMonths
  const trailingMonths =
    typeof rawTrailing === "number" &&
    Number.isFinite(rawTrailing) &&
    Math.floor(rawTrailing) >= 1 &&
    Math.floor(rawTrailing) <= 12
      ? Math.floor(rawTrailing)
      : 3
  const rawMin = record.minSpendMinor
  const minSpendMinor =
    typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin >= 0 ? Math.round(rawMin) : 0
  return {
    thresholdPct,
    trailingMonths,
    minSpendMinor,
    referenceDate: parseReferenceDate(record.referenceDate),
  }
}

export async function detectSpendingAnomalies(
  repositories: BudgetLensRepositories,
  args: unknown,
): Promise<unknown> {
  const options = parseAnomalyOptions(args)
  const currentMonth = options.referenceDate.slice(0, 7)
  const trailingMonths: string[] = []
  for (let offset = 1; offset <= options.trailingMonths; offset += 1) {
    trailingMonths.push(shiftISOMonth(options.referenceDate, -offset).slice(0, 7))
  }
  const transactions = await repositories.transactions.list()
  const byCategory = new Map<string, Map<string, number>>()
  for (const transaction of transactions) {
    const normalized = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (normalized >= 0) continue
    const month = transaction.date.slice(0, 7)
    if (month !== currentMonth && !trailingMonths.includes(month)) continue
    const category = transaction.category ?? "Uncategorized"
    const months = byCategory.get(category) ?? new Map<string, number>()
    months.set(month, (months.get(month) ?? 0) + Math.abs(normalized))
    byCategory.set(category, months)
  }
  const anomalies: SpendingAnomaly[] = []
  for (const [category, months] of byCategory) {
    const currentMinor = months.get(currentMonth) ?? 0
    const trailingTotal = trailingMonths.reduce((sum, month) => sum + (months.get(month) ?? 0), 0)
    const averageMinor = Math.round(trailingTotal / trailingMonths.length)
    if (averageMinor === 0) {
      if (currentMinor === 0 || currentMinor < options.minSpendMinor) continue
      anomalies.push({
        category,
        currentMinor,
        averageMinor,
        changePct: null,
        current: formatMinor(currentMinor),
        average: formatMinor(0),
        direction: "new",
      })
      continue
    }
    if (Math.max(currentMinor, averageMinor) < options.minSpendMinor) continue
    const changePct = ((currentMinor - averageMinor) / averageMinor) * 100
    if (Math.abs(changePct) < options.thresholdPct) continue
    anomalies.push({
      category,
      currentMinor,
      averageMinor,
      changePct: Math.round(changePct * 10) / 10,
      current: formatMinor(currentMinor),
      average: formatMinor(averageMinor),
      direction: changePct > 0 ? "spike" : "drop",
    })
  }
  anomalies.sort((left, right) => {
    if (left.changePct === null && right.changePct === null)
      return right.currentMinor - left.currentMinor
    if (left.changePct === null) return -1
    if (right.changePct === null) return 1
    return Math.abs(right.changePct) - Math.abs(left.changePct)
  })
  return {
    currentMonth,
    trailingMonths,
    thresholdPct: options.thresholdPct,
    checkedCategories: byCategory.size,
    anomalies: anomalies.slice(0, 10),
  }
}

export interface ComparePeriodsResult {
  category: string
  currentMonth: string
  previousMonth: string
  currentMinor: number
  previousMinor: number
  deltaMinor: number
  changePct: number | null
  current: string
  previous: string
  delta: string
}

export async function comparePeriodSpend(
  repositories: BudgetLensRepositories,
  args: unknown,
): Promise<ComparePeriodsResult> {
  const record = asRecord(args)
  const rawCategory = typeof record.category === "string" ? record.category.trim() : ""
  if (!rawCategory) throw new Error("compare_periods needs category.")
  const referenceDate = parseReferenceDate(record.referenceDate)
  const currentMonth = referenceDate.slice(0, 7)
  const previousMonth = shiftISOMonth(referenceDate, -1).slice(0, 7)
  const transactions = await repositories.transactions.list()
  let currentMinor = 0
  let previousMinor = 0
  for (const transaction of transactions) {
    const category = transaction.category ?? "Uncategorized"
    if (category !== rawCategory) continue
    const normalized = normalizeTransactionAmountMinor(
      transaction.amountMinor,
      transaction.transactionType,
    )
    if (normalized >= 0) continue
    const magnitude = Math.abs(normalized)
    const month = transaction.date.slice(0, 7)
    if (month === currentMonth) currentMinor += magnitude
    else if (month === previousMonth) previousMinor += magnitude
  }
  const deltaMinor = currentMinor - previousMinor
  const changePct =
    previousMinor === 0
      ? currentMinor === 0
        ? 0
        : null
      : Math.round((deltaMinor / previousMinor) * 100 * 10) / 10
  return {
    category: rawCategory,
    currentMonth,
    previousMonth,
    currentMinor,
    previousMinor,
    deltaMinor,
    changePct,
    current: formatMinor(currentMinor),
    previous: formatMinor(previousMinor),
    delta: formatMinor(deltaMinor),
  }
}
