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
import {
  buildFinanceSnapshot,
  executeAssistantTool,
  MAX_TOOL_ROWS,
  parseBudgetProposal,
  parseCreateTransactionProposal,
  parseDeleteTransactionProposal,
  parseRecategorizeProposal,
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
  it("links exact snapshot amounts to filtered transaction views", async () => {
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
    expect(cites[0]?.href.startsWith("/BudgetLens/transactions?")).toBe(true)
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
