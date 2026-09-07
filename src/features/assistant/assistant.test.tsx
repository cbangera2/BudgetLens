import { cleanup } from "@testing-library/react"

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
import { parseBudgetLensChartSpec } from "@/features/assistant/chart-block"
import {
  buildDashboardChartInputFromSaveChart,
  buildFinanceSnapshot,
  executeAssistantTool,
  ASSISTANT_SYSTEM_PROMPT,
  extractProposeTransactionDescription,
  guessProposeTransactionCategory,
  intersectChartCategories,
  MAX_TOOL_ROWS,
  parseBudgetProposal,
  parseCreateTransactionProposal,
  parseDeleteTransactionProposal,
  parseProposeTransaction,
  parseProposeTransactionAmount,
  parseRecategorizeProposal,
  parseSaveChartProposal,
  resolveProposeTransactionDate,
  summarizeVariance,
} from "@/features/assistant/data-tools"
import { readAssistantSettings } from "@/features/assistant/provider"

afterEach(() => {
  cleanup()
})

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

function goalsOf(output: unknown): unknown[] {
  if (!isRecord(output) || !Array.isArray(output.goals)) {
    throw new Error("expected goals in budget output")
  }
  return output.goals
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
    // Budget spend is scoped to the goal's current calendar period, so the
    // fixture transaction uses today's date to land in-period.
    const today = new Date().toISOString().slice(0, 10)
    const repos = stubRepositories({
      transactions: [
        { date: today, description: "Store", amountMinor: -1000, category: "Groceries" },
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

  it("scopes budget spend to expenses in the current period", async () => {
    const month = new Date().toISOString().slice(0, 7)
    const repos = stubRepositories({
      transactions: [
        { date: `${month}-05`, description: "Store", amountMinor: -1000, category: "Groceries" },
        { date: `${month}-06`, description: "Refund", amountMinor: 4000, category: "Groceries" },
        { date: "2020-01-05", description: "Old", amountMinor: -9000, category: "Groceries" },
      ],
      budgets: [{ category: "Groceries", amountMinor: 50000, period: "monthly" }],
    })
    const output: unknown = await executeAssistantTool(repos, "budget_status", {})
    expect(output).toMatchObject({
      goals: [{ category: "Groceries", spentMinor: 1000, over: false }],
    })
  })

  it("caps budget_status output with truncation metadata", async () => {
    const repos = stubRepositories({
      transactions: [],
      budgets: Array.from({ length: MAX_TOOL_ROWS + 10 }, (_, index) => ({
        category: `Category ${index}`,
        amountMinor: 1000,
        period: "monthly" as const,
      })),
    })
    const output: unknown = await executeAssistantTool(repos, "budget_status", {})
    expect(output).toMatchObject({ totalCount: MAX_TOOL_ROWS + 10, truncated: true })
    expect(goalsOf(output)).toHaveLength(MAX_TOOL_ROWS)
  })
})

describe("assistant markdown", () => {
  it("renders emphasis, lists, code, tables, and safe links", async () => {
    const { render } = await import("@testing-library/react")
    const { Markdown } = await import("@/features/assistant/markdown")
    const { getByText, getByRole, queryByRole } = render(
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

    expect(getByText("-$3,300.00").tagName).toBe("STRONG")
    expect(getByText("Groceries", { selector: "li" })).toBeInTheDocument()
    expect(getByRole("table")).toBeInTheDocument()
    expect(getByRole("link", { name: "docs" })).toHaveAttribute("href", "https://example.com/help")
    expect(queryByRole("link", { name: "evil" })).not.toBeInTheDocument()
  })

  it("renders a real finance answer with stray markers intact", async () => {
    const { render } = await import("@testing-library/react")
    const { Markdown } = await import("@/features/assistant/markdown")
    const { getByText, getAllByRole } = render(
      <Markdown
        id="finance-answer"
        text={[
          "Largest outflows you can verify in the Spending view:",
          "",
          "* Housing: **-$3,300.00** (2)",
          "* Travel: **-$1,242.15** (4)",
          "",
          "Inflows in the same period:",
          "",
          "* Income: **$15,750.00*** across 5 transactions",
        ].join("\n")}
      />,
    )

    expect(getByText("-$3,300.00").tagName).toBe("STRONG")
    expect(getAllByRole("listitem")).toHaveLength(3)
    expect(getByText("$15,750.00").tagName).toBe("STRONG")
  })
})

describe("assistant recategorize proposals", () => {
  it("parses a valid draft and rejects junk", () => {
    expect(
      parseRecategorizeProposal({ toCategory: "Groceries", affectedIds: ["tx-0", "tx-1"] }),
    ).toEqual({ toCategory: "Groceries", affectedIds: ["tx-0", "tx-1"] })
    expect(parseRecategorizeProposal({ toCategory: "", affectedIds: ["tx-0"] })).toBeNull()
    expect(parseRecategorizeProposal({ toCategory: "Groceries" })).toBeNull()
    expect(parseRecategorizeProposal({ toCategory: "Groceries", affectedIds: [] })).toBeNull()
    expect(parseRecategorizeProposal({ toCategory: "  ", affectedIds: ["tx-0"] })).toBeNull()
  })

  it("drafts recategorize without writing", async () => {
    const repos = stubRepositories({
      transactions: [
        {
          date: "2026-08-01",
          description: "Store run",
          amountMinor: -1000,
          category: "Dining Out",
        },
        {
          date: "2026-08-02",
          description: "Store run",
          amountMinor: -2000,
          category: "Dining Out",
        },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "propose_recategorize", {
      toCategory: "Groceries",
    })
    expect(output).toMatchObject({
      draft: true,
      toCategory: "Groceries",
      affectedCount: 2,
      totalCount: 2,
      truncated: false,
    })
    if (!isRecord(output) || !Array.isArray(output.affectedIds)) {
      throw new Error("expected affectedIds in recategorize output")
    }
    expect(output.affectedIds).toHaveLength(2)
    const rows = await repos.transactions.list()
    expect(rows).toHaveLength(2)
    expect(rows[0]?.category).toBe("Dining Out")
  })

  it("caps recategorize drafts at 50 rows", async () => {
    const repos = stubRepositories({
      transactions: Array.from({ length: MAX_TOOL_ROWS + 10 }, (_, index) => ({
        date: "2026-08-01",
        description: `Row ${index}`,
        amountMinor: -100,
        category: "Dining Out",
      })),
    })
    const output: unknown = await executeAssistantTool(repos, "propose_recategorize", {
      toCategory: "Groceries",
      limit: MAX_TOOL_ROWS + 999,
    })
    if (!isRecord(output) || !Array.isArray(output.affectedIds)) {
      throw new Error("expected affectedIds in recategorize output")
    }
    expect(output.affectedIds).toHaveLength(MAX_TOOL_ROWS)
    expect(output).toMatchObject({ truncated: true, totalCount: MAX_TOOL_ROWS + 10 })
  })

  it("requires toCategory", async () => {
    const repos = stubRepositories({})
    await expect(executeAssistantTool(repos, "propose_recategorize", {})).rejects.toThrow(
      "toCategory",
    )
  })
})

describe("assistant variance", () => {
  it("summarizes the biggest mover", async () => {
    const { formatMinor } = await import("@/features/assistant/provider")
    const summary = summarizeVariance({
      generatedAt: "2026-09-05T00:00:00.000Z",
      transactionCount: 3,
      spending: [
        { category: "Groceries", count: 2, totalMinor: -1000, total: formatMinor(-1000) },
        { category: "Transport", count: 1, totalMinor: -500, total: formatMinor(-500) },
      ],
      previousSpending: [
        { category: "Groceries", count: 2, totalMinor: -5000, total: formatMinor(-5000) },
        { category: "Transport", count: 1, totalMinor: -600, total: formatMinor(-600) },
      ],
      budgets: [],
      netWorth: [],
      extremes: { largestExpense: null, largestIncome: null },
      topTransactions: [],
      dailySeries: [],
      recentTransactions: [],
    })
    expect(summary).toContain("Groceries")
    expect(summary).toContain(formatMinor(4000))
    expect(summary.split("\n").length).toBeLessThanOrEqual(3)
  })

  it("includes previousSpending without throwing on empty repos", async () => {
    const repos = stubRepositories({})
    const snapshot = await buildFinanceSnapshot(repos)
    expect(snapshot.previousSpending).toEqual([])
    expect(snapshot.spending).toEqual([])
    expect(typeof snapshot.generatedAt).toBe("string")
  })
})

describe("assistant proposal card", () => {
  it("approves, dismisses, and shows applied state", async () => {
    const { render, screen, fireEvent } = await import("@testing-library/react")
    const { ProposalCard } = await import("@/features/assistant/proposal-card")

    let approved = 0
    let dismissed = 0
    const { rerender } = render(
      <ProposalCard
        title="Proposed recategorize"
        lines={["Dining Out → Groceries · 2 transactions"]}
        status="idle"
        onApprove={() => {
          approved += 1
        }}
        onDismiss={() => {
          dismissed += 1
        }}
      />,
    )
    expect(screen.getByRole("group")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /approve \+ apply/i }))
    expect(approved).toBe(1)
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))
    expect(dismissed).toBe(1)

    rerender(
      <ProposalCard
        title="Proposed recategorize"
        lines={["Dining Out → Groceries · 2 transactions"]}
        status="applied"
        onApprove={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.getByText(/applied ✓/)).toBeInTheDocument()
  })
})

describe("assistant chart fence", () => {
  it("renders a bar chart fence as svg with its title", async () => {
    const { render } = await import("@testing-library/react")
    const { Markdown } = await import("@/features/assistant/markdown")
    const spec = JSON.stringify({
      type: "bar",
      title: "Spending by category",
      unit: "$",
      data: [
        { label: "Housing", value: 3300 },
        { label: "Travel", value: 1242.15 },
        { label: "Groceries", value: 1141 },
      ],
    })
    const { container } = render(
      <Markdown id="chart-bar" text={["```budgetlens-chart", spec, "```"].join("\n")} />,
    )
    expect(container.querySelector("figcaption")?.textContent).toBe("Spending by category")
    expect(container.querySelector("svg")).not.toBeNull()
    const labels = [...container.querySelectorAll('th[scope="row"]')].map(
      (cell) => cell.textContent ?? "",
    )
    expect(labels.some((label) => label.includes("Housing"))).toBe(true)
  })

  it("falls back to code for an invalid chart fence", async () => {
    const { render } = await import("@testing-library/react")
    const { Markdown } = await import("@/features/assistant/markdown")
    const { container } = render(
      <Markdown id="chart-invalid" text={["```budgetlens-chart", "{not json", "```"].join("\n")} />,
    )
    expect(container.querySelector("svg")).toBeNull()
    expect(container.querySelector("pre code")?.textContent).toContain("{not json")
  })

  it("leaves non-chart fences unchanged", async () => {
    const { render } = await import("@testing-library/react")
    const { Markdown } = await import("@/features/assistant/markdown")
    const { container } = render(
      <Markdown id="chart-other" text={["```js", "const x = 1", "```"].join("\n")} />,
    )
    expect(container.querySelector("svg")).toBeNull()
    expect(container.querySelector("pre code")?.textContent).toContain("const x = 1")
  })
})

describe("assistant citations", () => {
  it("links exact snapshot amounts to transaction detail pages", async () => {
    const { extractCitations } = await import("@/features/assistant/citations")
    const { text, cites } = extractCitations(
      "Top outflow Housing: -$3,300.00 (2). Income was $15,750.00.",
      [
        {
          id: "a",
          date: "2026-08-01",
          description: "Rent",
          amount: "-$3,300.00",
          category: "Housing",
        },
        {
          id: "b",
          date: "2026-08-01",
          description: "Pay",
          amount: "$15,750.00",
          category: "Income",
        },
      ],
      "/",
    )
    expect(cites).toHaveLength(2)
    expect(text).toContain("-$3,300.00[[cite:1]]")
    expect(cites[0]?.href).toBe("/transactions/a")
    expect(cites[1]?.href).toBe("/transactions/b")
  })

  it("links category aggregates to filtered transaction views", async () => {
    const { extractCitations } = await import("@/features/assistant/citations")
    const { cites } = extractCitations(
      "Housing total -$3,300.00 this month.",
      [
        {
          id: "cat:Housing",
          date: "2026-08-01",
          description: null,
          amount: "-$3,300.00",
          category: "Housing",
        },
      ],
      "/",
    )
    expect(cites).toHaveLength(1)
    expect(cites[0]?.href).toContain("/transactions?")
    expect(cites[0]?.href).toContain("sort=amount-desc")
    expect(cites[0]?.href).toContain("categories=Housing")
  })

  it("skips code fences and caps markers", async () => {
    const { extractCitations, MAX_CITATIONS } = await import("@/features/assistant/citations")
    const rows = Array.from({ length: MAX_CITATIONS + 5 }, (_, index) => ({
      id: `r${index}`,
      date: "2026-08-01",
      description: `Item ${index}`,
      amount: `-$${index + 1}.00`,
      category: "Misc",
    }))
    const { text, cites } = extractCitations(
      [
        "```",
        "-$1.00 should stay plain",
        "```",
        ...rows.map((row) => `Row ${row.amount} here`),
      ].join("\n"),
      rows,
      "/BudgetLens/",
    )
    expect(cites.length).toBeLessThanOrEqual(MAX_CITATIONS)
    expect(text.startsWith("```\n-$1.00 should stay plain\n```")).toBe(true)
    expect(cites[0]?.href.startsWith("/BudgetLens/transactions/r")).toBe(true)
  })

  it("renders cite markers as links", async () => {
    const { render } = await import("@testing-library/react")
    const { Markdown } = await import("@/features/assistant/markdown")
    const { getByRole } = render(
      <Markdown
        id="cite-render"
        text="Housing cost -$3,300.00[[cite:1]] this month."
        cites={[{ index: 1, label: "Rent · -$3,300.00", href: "/transactions?sort=amount-desc" }]}
      />,
    )
    expect(
      getByRole("link", { name: "Open supporting transactions: Rent · -$3,300.00" }),
    ).toHaveAttribute("href", "/transactions?sort=amount-desc")
  })
})

describe("assistant write tools", () => {
  it("parses create drafts and rejects bad input", async () => {
    expect(
      parseCreateTransactionProposal({
        date: "2026-08-03",
        description: "Latte",
        amountMinor: -540,
        category: "Dining Out",
      }),
    ).toMatchObject({ date: "2026-08-03", description: "Latte", amountMinor: -540 })
    expect(
      parseCreateTransactionProposal({ date: "08/03/2026", description: "x", amountMinor: 1 }),
    ).toBeNull()
    expect(
      parseCreateTransactionProposal({ date: "2026-08-03", description: "  ", amountMinor: 1 }),
    ).toBeNull()
    expect(parseCreateTransactionProposal({ date: "2026-08-03", description: "x" })).toBeNull()
  })

  it("parses delete drafts and rejects missing ids", async () => {
    expect(parseDeleteTransactionProposal({ id: "tx-1" })).toMatchObject({ id: "tx-1" })
    expect(parseDeleteTransactionProposal({})).toBeNull()
  })

  it("drafts creates without applying", async () => {
    const repos = stubRepositories({})
    const output = await executeAssistantTool(repos, "create_transaction", {
      date: "2026-08-03",
      description: "Latte",
      amountMinor: -540,
    })
    expect(output).toMatchObject({ draft: true, kind: "create_transaction" })
  })

  it("drafts deletes with a preview of the real row", async () => {
    const repos = stubRepositories({})
    repos.transactions.get = async (id: string) =>
      id === "tx-9"
        ? {
            id: "tx-9",
            date: "2026-08-03",
            description: "Latte",
            amountMinor: -540,
            category: "Dining Out",
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
            fingerprint: "fp",
            createdAt: "2026-08-03T00:00:00.000Z",
            updatedAt: "2026-08-03T00:00:00.000Z",
          }
        : undefined
    const output = await executeAssistantTool(repos, "delete_transaction", { id: "tx-9" })
    expect(output).toMatchObject({ draft: true, kind: "delete_transaction", id: "tx-9" })
    await expect(executeAssistantTool(repos, "delete_transaction", { id: "nope" })).rejects.toThrow(
      "not found",
    )
  })

  it("caps recent snapshot rows with ids", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-08-03", description: "Latte", amountMinor: -540, category: "Dining Out" },
        { date: "2026-08-02", description: "Bus", amountMinor: -250, category: "Transport" },
      ],
    })
    const snapshot = await buildFinanceSnapshot(repos)
    expect(snapshot.recentTransactions).toHaveLength(2)
    expect(snapshot.recentTransactions[0]?.date).toBe("2026-08-03")
    expect(typeof snapshot.recentTransactions[0]?.id).toBe("string")
  })
})

describe("assistant chart instruction", () => {
  it("teaches the budgetlens-chart fence with a parseable example shape", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("```budgetlens-chart")
    // The documented contract, verbatim in structure: bar/donut, titled,
    // 1..12 labeled slices with finite values from tool results.
    expect(
      parseBudgetLensChartSpec({
        type: "bar",
        title: "Spending by category",
        unit: "$",
        data: [
          { label: "Groceries", value: 1141 },
          { label: "Dining Out", value: 540 },
        ],
      }),
    ).toMatchObject({ type: "bar", title: "Spending by category" })
    expect(
      parseBudgetLensChartSpec({
        type: "pie",
        title: "Nope",
        data: [{ label: "Example", value: 1 }],
      }),
    ).toBeNull()
    expect(
      parseBudgetLensChartSpec({
        type: "line",
        title: "Net worth trend",
        unit: "$",
        data: [
          { label: "Jan", value: 10000 },
          { label: "Feb", value: 10500 },
        ],
      }),
    ).toMatchObject({ type: "line", title: "Net worth trend" })
  })
})

describe("assistant propose_transaction", () => {
  it("parses amount formats", () => {
    expect(parseProposeTransactionAmount("spent $12 on coffee")?.amountMinor).toBe(-1200)
    expect(parseProposeTransactionAmount("spent $12.50 on coffee")?.amountMinor).toBe(-1250)
    expect(parseProposeTransactionAmount("spent $1,234.56 on rent")?.amountMinor).toBe(-123456)
    expect(parseProposeTransactionAmount("spent 12 dollars on coffee")?.amountMinor).toBe(-1200)
    expect(parseProposeTransactionAmount("received $20 paycheck")?.amountMinor).toBe(2000)
    expect(parseProposeTransactionAmount("no money here")).toBeNull()
  })

  it("resolves relative dates", () => {
    expect(resolveProposeTransactionDate("spent $12 today", "2026-09-07")).toBe("2026-09-07")
    expect(resolveProposeTransactionDate("spent $12 on coffee yesterday", "2026-09-07")).toBe(
      "2026-09-06",
    )
    expect(resolveProposeTransactionDate("spent $5 3 days ago", "2026-09-07")).toBe("2026-09-04")
    expect(resolveProposeTransactionDate("spent $5 2 weeks ago", "2026-09-07")).toBe("2026-08-24")
    expect(resolveProposeTransactionDate("spent $5 on 2026-08-01", "2026-09-07")).toBe("2026-08-01")
    expect(resolveProposeTransactionDate("spent $5 last week", "2026-09-07")).toBe("2026-08-31")
  })

  it("extracts merchant text and guesses category", () => {
    expect(extractProposeTransactionDescription("spent $12 on coffee yesterday", "$12")).toBe(
      "coffee",
    )
    expect(guessProposeTransactionCategory("coffee")).toBe("Dining Out")
    expect(guessProposeTransactionCategory("weekly groceries at market")).toBe("Groceries")
    expect(guessProposeTransactionCategory("gas station fill")).toBe("Transport")
    expect(guessProposeTransactionCategory("mystery widget xyz")).toBeNull()
  })

  it("parses a full NL draft and rejects junk", () => {
    expect(
      parseProposeTransaction({ text: "spent $12 on coffee yesterday", today: "2026-09-07" }),
    ).toMatchObject({
      date: "2026-09-06",
      description: "coffee",
      amountMinor: -1200,
      category: "Dining Out",
    })
    expect(parseProposeTransaction({ text: "hello there" })).toBeNull()
    expect(parseProposeTransaction({})).toBeNull()
  })

  it("drafts without applying", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-09-01", description: "Existing", amountMinor: -100, category: "Groceries" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "propose_transaction", {
      text: "spent $12 on coffee yesterday",
      today: "2026-09-07",
    })
    expect(output).toMatchObject({ draft: true, kind: "propose_transaction", amountMinor: -1200 })
    const rows = await repos.transactions.list()
    expect(rows).toHaveLength(1)
  })

  it("applies the approved draft via repositories.add", async () => {
    const repos = stubRepositories({})
    const added: Array<{ date: string; description: string; amountMinor: number }> = []
    repos.transactions.add = async (draft) => {
      added.push({
        date: draft.date,
        description: draft.description,
        amountMinor: draft.amountMinor,
      })
      return {
        id: "tx-new",
        date: draft.date,
        description: draft.description,
        amountMinor: draft.amountMinor,
        category: draft.category,
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
        fingerprint: "fp-new",
        createdAt: "2026-09-07T00:00:00.000Z",
        updatedAt: "2026-09-07T00:00:00.000Z",
      }
    }
    const draft = parseProposeTransaction({
      text: "spent $12 on coffee yesterday",
      today: "2026-09-07",
    })
    expect(draft).not.toBeNull()
    if (!draft) throw new Error("expected draft")
    await repos.transactions.add({
      date: draft.date,
      description: draft.description,
      amountMinor: draft.amountMinor,
      category: draft.category,
      transactionType: null,
      accountName: draft.accountName,
      accountType: null,
      provider: null,
      labels: [],
      notes: draft.notes,
    })
    expect(added).toMatchObject([{ date: "2026-09-06", description: "coffee", amountMinor: -1200 }])
  })
})

describe("assistant save_chart", () => {
  it("parses a valid spec and rejects junk", () => {
    expect(
      parseSaveChartProposal({
        title: "Spending by category",
        type: "bar",
        data: [
          { label: "Groceries", value: 1141 },
          { label: "Dining Out", value: 540 },
        ],
      }),
    ).toMatchObject({ spec: { title: "Spending by category", type: "bar" } })
    expect(
      parseSaveChartProposal({
        spec: { title: "Trend", type: "line", data: [{ label: "Jan", value: 1 }] },
      }),
    ).toMatchObject({ spec: { type: "line" } })
    expect(parseSaveChartProposal({ title: "Nope", type: "pie", data: [] })).toBeNull()
    expect(parseSaveChartProposal({})).toBeNull()
  })

  it("drafts without persisting", async () => {
    const repos = stubRepositories({})
    const output: unknown = await executeAssistantTool(repos, "save_chart", {
      title: "Spending by category",
      type: "bar",
      data: [{ label: "Groceries", value: 1141 }],
    })
    expect(output).toMatchObject({ draft: true, kind: "save_chart" })
    if (!isRecord(output) || !isRecord(output.spec)) throw new Error("expected spec in output")
    expect(output.spec).toMatchObject({ title: "Spending by category" })
  })

  it("round-trips through dashboard storage helpers", async () => {
    const { createChart, deserializeDashboardConfiguration } =
      await import("@/features/charts/configuration")
    const draft = parseSaveChartProposal({
      title: "Spending by category",
      type: "bar",
      data: [
        { label: "Groceries", value: 1141 },
        { label: "Dining Out", value: 540 },
      ],
    })
    if (!draft) throw new Error("expected chart draft")
    const input = buildDashboardChartInputFromSaveChart(draft.spec, "test-chart-1")
    const base = deserializeDashboardConfiguration(null)
    const next = createChart(base, input)
    const serialized = JSON.stringify(next)
    const restored = deserializeDashboardConfiguration(serialized)
    expect(restored.customCharts.map((chart) => chart.title)).toContain("Spending by category")
    const saved = restored.customCharts.find((chart) => chart.id === "test-chart-1")
    expect(saved?.type).toBe("bar-vertical")
    expect(saved?.metrics).toContain("expenses")
  })

  it("keeps only labels that match known categories", () => {
    expect(
      intersectChartCategories(
        ["Groceries", "Starbucks", "Groceries", "  "],
        ["Groceries", "Dining Out"],
      ),
    ).toEqual(["Groceries"])
    expect(intersectChartCategories(["2026-09", "Starbucks"], ["Groceries"])).toEqual([])
    expect(intersectChartCategories([], ["Groceries"])).toEqual([])
  })
})

describe("assistant anomaly detection", () => {
  it("flags spikes above the threshold", async () => {
    const repos = stubRepositories({
      transactions: [
        {
          date: "2026-09-05",
          description: "Groceries",
          amountMinor: -10000,
          category: "Groceries",
        },
        { date: "2026-08-05", description: "Groceries", amountMinor: -2000, category: "Groceries" },
        { date: "2026-07-05", description: "Groceries", amountMinor: -2000, category: "Groceries" },
        { date: "2026-06-05", description: "Groceries", amountMinor: -2000, category: "Groceries" },
        { date: "2026-09-05", description: "Bus", amountMinor: -2000, category: "Transport" },
        { date: "2026-08-05", description: "Bus", amountMinor: -2000, category: "Transport" },
        { date: "2026-07-05", description: "Bus", amountMinor: -2000, category: "Transport" },
        { date: "2026-06-05", description: "Bus", amountMinor: -2000, category: "Transport" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "detect_spending_anomalies", {
      thresholdPct: 50,
      referenceDate: "2026-09-15",
    })
    if (!isRecord(output) || !Array.isArray(output.anomalies)) {
      throw new Error("expected anomalies in output")
    }
    const categories = output.anomalies.map((entry) =>
      isRecord(entry) ? entry.category : undefined,
    )
    expect(categories).toContain("Groceries")
    expect(categories).not.toContain("Transport")
  })

  it("returns new-spend entries when there is no history", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-09-05", description: "Coffee", amountMinor: -1200, category: "Dining Out" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "detect_spending_anomalies", {
      referenceDate: "2026-09-15",
    })
    if (!isRecord(output) || !Array.isArray(output.anomalies)) {
      throw new Error("expected anomalies in output")
    }
    expect(output.anomalies).toHaveLength(1)
    const entry: unknown = output.anomalies[0]
    if (!isRecord(entry)) throw new Error("expected anomaly entry")
    expect(entry).toMatchObject({ category: "Dining Out", direction: "new", changePct: null })
  })

  it("returns empty anomalies for empty repos", async () => {
    const repos = stubRepositories({})
    const output: unknown = await executeAssistantTool(repos, "detect_spending_anomalies", {
      referenceDate: "2026-09-15",
    })
    expect(output).toMatchObject({ anomalies: [], checkedCategories: 0 })
  })
})

describe("assistant compare_periods", () => {
  it("computes this-month vs last-month math", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-09-05", description: "Store", amountMinor: -10000, category: "Groceries" },
        { date: "2026-08-05", description: "Store", amountMinor: -4000, category: "Groceries" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "compare_periods", {
      category: "Groceries",
      referenceDate: "2026-09-15",
    })
    expect(output).toMatchObject({
      category: "Groceries",
      currentMonth: "2026-09",
      previousMonth: "2026-08",
      currentMinor: 10000,
      previousMinor: 4000,
      deltaMinor: 6000,
      changePct: 150,
      matchedTransactions: 2,
    })
  })

  it("matches categories case-insensitively and counts matches", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-09-05", description: "Store", amountMinor: -10000, category: "Groceries" },
        { date: "2026-08-05", description: "Store", amountMinor: -4000, category: "Groceries" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "compare_periods", {
      category: "groceries",
      referenceDate: "2026-09-15",
    })
    expect(output).toMatchObject({
      currentMinor: 10000,
      previousMinor: 4000,
      matchedTransactions: 2,
    })
  })

  it("distinguishes unmatched categories from zero spend", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-09-05", description: "Store", amountMinor: -1000, category: "Groceries" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "compare_periods", {
      category: "Travel",
      referenceDate: "2026-09-15",
    })
    expect(output).toMatchObject({
      currentMinor: 0,
      previousMinor: 0,
      changePct: 0,
      matchedTransactions: 0,
    })
  })

  it("reports null change when there is no prior spend", async () => {
    const repos = stubRepositories({
      transactions: [
        { date: "2026-09-05", description: "Store", amountMinor: -1000, category: "Groceries" },
      ],
    })
    const output: unknown = await executeAssistantTool(repos, "compare_periods", {
      category: "Groceries",
      referenceDate: "2026-09-15",
    })
    expect(output).toMatchObject({ currentMinor: 1000, previousMinor: 0, changePct: null })
  })

  it("requires a category", async () => {
    const repos = stubRepositories({})
    await expect(executeAssistantTool(repos, "compare_periods", {})).rejects.toThrow("category")
  })
})
