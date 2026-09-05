import type { Transaction } from "@/domain/models"
import type {
  BudgetLensRepositories,
  BudgetRepository,
  ImportRepository,
  TransactionGroupRepository,
  TransactionRepository,
  WealthAccountRepository,
  WealthBreakdownRepository,
  WealthRepository,
} from "@/domain/repositories"
import {
  buildFinanceSnapshot,
  executeAssistantTool,
  MAX_TOOL_ROWS,
  parseBudgetProposal,
} from "@/features/assistant/data-tools"
import { readAssistantSettings } from "@/features/assistant/provider"

interface StubTransaction {
  date: string
  description: string
  amountMinor: number
  category: string | null
}

function stubTransactions(rows: StubTransaction[]): TransactionRepository {
  return {
    list: async () =>
      rows.map(
        (row, index): Transaction => ({
          id: `tx-${index}`,
          date: row.date,
          description: row.description,
          amountMinor: row.amountMinor,
          category: row.category,
          transactionType: null,
          accountName: null,
          accountType: null,
          provider: null,
          labels: [],
          notes: null,
          groupId: null,
          shared: false,
          shareCount: 2,
          importBatchId: "manual",
          fingerprint: `fp-${index}`,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    get: async () => undefined,
    add: async () => {
      throw new Error("not implemented in stub")
    },
    update: async () => {
      throw new Error("not implemented in stub")
    },
    updateMany: async () => undefined,
    remove: async () => undefined,
    clear: async () => undefined,
  }
}

function stubBudgets(
  goals: Array<{ category: string; amountMinor: number; period: "monthly" | "yearly" }>,
): BudgetRepository {
  return {
    list: async () =>
      goals.map((goal, index) => ({
        id: `budget-${index}`,
        category: goal.category,
        amountMinor: goal.amountMinor,
        period: goal.period,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    put: async () => {
      throw new Error("not implemented in stub")
    },
    remove: async () => undefined,
    clear: async () => undefined,
  }
}

const emptyWealth: WealthRepository = {
  list: async () => [],
  clear: async () => undefined,
}
const emptyWealthBreakdown: WealthBreakdownRepository = {
  list: async () => [],
  clear: async () => undefined,
}
const emptyWealthAccounts: WealthAccountRepository = {
  list: async () => [],
  clear: async () => undefined,
}
const emptyImports: ImportRepository = {
  list: async () => [],
  clear: async () => undefined,
}
const emptyGroups: TransactionGroupRepository = {
  list: async () => [],
  get: async () => undefined,
  put: async () => {
    throw new Error("not implemented in stub")
  },
  remove: async () => undefined,
  members: async () => [],
  clear: async () => undefined,
}

function stubRepositories(overrides: {
  transactions?: StubTransaction[]
  budgets?: Array<{ category: string; amountMinor: number; period: "monthly" | "yearly" }>
}): BudgetLensRepositories {
  return {
    transactions: stubTransactions(overrides.transactions ?? []),
    wealth: emptyWealth,
    wealthBreakdown: emptyWealthBreakdown,
    wealthAccounts: emptyWealthAccounts,
    imports: emptyImports,
    budgets: stubBudgets(overrides.budgets ?? []),
    transactionGroups: emptyGroups,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

describe("assistant provider settings", () => {
  it("defaults to the local OpenCode bridge", () => {
    const settings = readAssistantSettings({ getItem: () => null })
    expect(settings.provider).toBe("opencode-bridge")
    expect(settings.baseURL).toContain("127.0.0.1")
  })

  it("falls back on malformed storage", () => {
    const settings = readAssistantSettings({ getItem: () => "not-json" })
    expect(settings.provider).toBe("opencode-bridge")
  })
})

describe("assistant budget proposals", () => {
  it("parses a valid draft and rejects junk", () => {
    expect(parseBudgetProposal({ category: "Groceries", amountMinor: 50000 })).toEqual({
      category: "Groceries",
      amountMinor: 50000,
      period: "monthly",
    })
    expect(parseBudgetProposal({ category: "", amountMinor: 1 })).toBeNull()
    expect(parseBudgetProposal({ category: "x" })).toBeNull()
  })

  it("drafts without applying", async () => {
    const repos = stubRepositories({})
    const output: unknown = await executeAssistantTool(repos, "propose_budget_change", {
      category: "Groceries",
      amountMinor: 50000,
    })
    expect(output).toMatchObject({ draft: true, category: "Groceries" })
  })
})

describe("assistant data tools", () => {
  it("aggregates spending by category", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-08-01", description: "Store", amountMinor: -1000, category: "Groceries" },
        { date: "2026-08-02", description: "Store", amountMinor: -2000, category: "Groceries" },
        { date: "2026-08-03", description: "Fuel", amountMinor: -5000, category: "Transport" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "spending_by_category", {})
    expect(output).toMatchObject({ transactionCount: 3 })
    if (!isRecord(output) || !Array.isArray(output.buckets)) {
      throw new Error("expected buckets in spending output")
    }
    expect(output.buckets[0]).toMatchObject({ category: "Transport", totalMinor: -5000 })
  })

  it("caps raw transaction rows", async () => {
    const repos = stubRepositories({
      transactions: Array.from({ length: MAX_TOOL_ROWS + 10 }, (_, index) => ({
        date: "2026-08-01",
        description: `Row ${index} with a very long description that should be truncated away`,
        amountMinor: -100,
        category: "Groceries",
      })),
    })
    const output: unknown = await executeAssistantTool(repos, "search_transactions", {
      limit: MAX_TOOL_ROWS + 999,
    })
    if (!isRecord(output) || !Array.isArray(output.rows)) {
      throw new Error("expected rows in search output")
    }
    expect(output.rows).toHaveLength(MAX_TOOL_ROWS)
    expect(output).toMatchObject({ truncated: true })
    const first: unknown = output.rows[0]
    if (!isRecord(first) || typeof first.description !== "string") {
      throw new Error("expected a description on the first row")
    }
    expect(first.description.length).toBeLessThanOrEqual(61)
  })

  it("rejects unknown tools", async () => {
    const repos = stubRepositories({})
    await expect(executeAssistantTool(repos, "drop_database", {})).rejects.toThrow("Unknown tool")
  })

  it("builds a capped finance snapshot for the harness", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-08-01", description: "Store", amountMinor: -1000, category: "Groceries" },
      ],
      budgets: [{ category: "Groceries", amountMinor: 50000, period: "monthly" }],
    })
    const snapshot = await buildFinanceSnapshot(repos)
    expect(snapshot.transactionCount).toBe(1)
    expect(snapshot.spending).toHaveLength(1)
    expect(snapshot.budgets).toMatchObject([
      { category: "Groceries", spentMinor: 1000, over: false },
    ])
    expect(snapshot.netWorth).toEqual([])
    expect(typeof snapshot.generatedAt).toBe("string")
  })
})

describe("assistant markdown", () => {
  it("renders emphasis, lists, code, tables, and safe links", async () => {
    const { render, screen } = await import("@testing-library/react")
    const { Markdown } = await import("@/features/assistant/markdown")
    render(
      <Markdown
        id="test-doc"
        text={[
          "Housing costs **-$3,300.00** with `2` transactions.",
          "",
          "- Groceries",
          "- Travel",
          "",
          "| Category | Total |",
          "| --- | --- |",
          "| Groceries | -$1,141.00 |",
          "",
          "See [docs](https://example.com/help) and [evil](javascript:alert(1)).",
        ].join("\n")}
      />,
    )

    expect(screen.getByText("-$3,300.00").tagName).toBe("STRONG")
    expect(screen.getByText("Groceries", { selector: "li" })).toBeInTheDocument()
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com/help",
    )
    expect(screen.queryByRole("link", { name: "evil" })).not.toBeInTheDocument()
  })
})
