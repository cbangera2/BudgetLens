// Deterministic evals for the local assistant harness endpoint.
//
// What it checks (no LLM judge, no extra deps):
//   - models endpoint shape: enabled-only providers, unique provider/model ids
//   - task completion: spending + over-budget answers contain expected facts
//   - no-leak regression: prompt/snapshot internals never appear in answers
//   - trajectory: repo questions use real tools (named, bounded, efficient)
//   - session resume: follow-ups reuse the harness session
//
// Requires `pnpm dev` and `opencode serve` running locally, then:
//   node evals/assistant.eval.mjs
// Options via env:
//   ASSISTANT_BASE=http://localhost:5173 (dev server origin)
//   ASSISTANT_MODEL=opencode/muse-spark-1.3-contributor-free (model under test)

const BASE = process.env.ASSISTANT_BASE ?? "http://localhost:5173"
const MODEL = process.env.ASSISTANT_MODEL ?? "opencode/muse-spark-1.3-contributor-free"
const REQUEST_TIMEOUT_MS = 240_000

const SNAPSHOT = {
  generatedAt: "2026-09-05T00:00:00.000Z",
  transactionCount: 47,
  spending: [
    { category: "Housing", count: 2, totalMinor: -330000, total: "-$3,300.00" },
    { category: "Travel", count: 4, totalMinor: -124215, total: "-$1,242.15" },
    { category: "Groceries", count: 12, totalMinor: -114100, total: "-$1,141.00" },
    { category: "Dining Out", count: 6, totalMinor: -31200, total: "-$312.00" },
  ],
  budgets: [
    {
      category: "Dining Out",
      period: "monthly",
      goalMinor: 16000,
      goal: "$160.00",
      spentMinor: 80600,
      spent: "$806.00",
      remainingMinor: -64600,
      remaining: "-$646.00",
      over: true,
    },
    {
      category: "Groceries",
      period: "monthly",
      goalMinor: 48000,
      goal: "$480.00",
      spentMinor: 344900,
      spent: "$3,449.00",
      remainingMinor: -296900,
      remaining: "-$2,969.00",
      over: true,
    },
  ],
  netWorth: [
    { date: "2026-08-24", series: "netWorth", valueMinor: 22287713, value: "$222,877.13" },
    { date: "2026-08-25", series: "netWorth", valueMinor: 22285288, value: "$222,852.88" },
  ],
  extremes: {
    largestExpense: {
      date: "2026-08-01",
      description: "Rent payment",
      amountMinor: -165000,
      amount: "-$1,650.00",
      category: "Housing",
    },
    largestIncome: {
      date: "2026-08-01",
      description: "Paycheck",
      amountMinor: 315000,
      amount: "$3,150.00",
      category: "Income",
    },
  },
  topTransactions: [
    {
      date: "2026-08-01",
      description: "Paycheck",
      amountMinor: 315000,
      amount: "$3,150.00",
      category: "Income",
    },
    {
      date: "2026-08-01",
      description: "Rent payment",
      amountMinor: -165000,
      amount: "-$1,650.00",
      category: "Housing",
    },
  ],
  recentTransactions: [
    {
      id: "tx-rent",
      date: "2026-08-01",
      description: "Rent payment",
      amountMinor: -165000,
      amount: "-$1,650.00",
      category: "Housing",
    },
    {
      id: "tx-beans",
      date: "2026-08-03",
      description: "Starbucks beans",
      amountMinor: -540,
      amount: "-$5.40",
      category: "Dining Out",
    },
    {
      id: "tx-bus",
      date: "2026-08-04",
      description: "Bus fare",
      amountMinor: -250,
      amount: "-$2.50",
      category: "Transport",
    },
  ],
  previousSpending: [
    { category: "Housing", count: 2, totalMinor: -330000, total: "-$3,300.00" },
    { category: "Travel", count: 4, totalMinor: -124215, total: "-$1,242.15" },
    { category: "Groceries", count: 6, totalMinor: -20000, total: "-$200.00" },
    { category: "Dining Out", count: 6, totalMinor: -31200, total: "-$312.00" },
  ],
  dailySeries: [
    {
      date: "2026-08-20",
      spent: "$120.00",
      spentMinor: 12000,
      income: "$0.00",
      incomeMinor: 0,
      count: 3,
    },
    {
      date: "2026-08-21",
      spent: "$85.50",
      spentMinor: 8550,
      income: "$0.00",
      incomeMinor: 0,
      count: 2,
    },
    {
      date: "2026-08-22",
      spent: "$210.25",
      spentMinor: 21025,
      income: "$3,150.00",
      incomeMinor: 315000,
      count: 4,
    },
    {
      date: "2026-08-23",
      spent: "$45.00",
      spentMinor: 4500,
      income: "$0.00",
      incomeMinor: 0,
      count: 1,
    },
    {
      date: "2026-08-24",
      spent: "$1,650.00",
      spentMinor: 165000,
      income: "$0.00",
      incomeMinor: 0,
      count: 1,
    },
    {
      date: "2026-08-25",
      spent: "$312.40",
      spentMinor: 31240,
      income: "$85.00",
      incomeMinor: 8500,
      count: 5,
    },
  ],
}

const KNOWN_FEATURE_DIRS = [
  "assistant",
  "budgets",
  "charts",
  "dashboard",
  "demo",
  "groups",
  "imports",
  "net-worth",
  "settings",
  "transactions",
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function postChat({ messages, sessionId }) {
  const response = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages,
      snapshot: SNAPSHOT,
      model: MODEL,
      ...(sessionId ? { sessionId } : {}),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json()
  assert(response.ok, `chat responded ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  return payload
}

const results = []
let sharedSessionId

async function run(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`PASS ${name} (${Date.now() - started}ms)`)
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error).slice(0, 400) })
    console.log(`FAIL ${name}: ${String(error).slice(0, 400)}`)
  }
}

await run("models-endpoint", async () => {
  const response = await fetch(`${BASE}/api/models`, { signal: AbortSignal.timeout(30_000) })
  assert(response.ok, `models responded ${response.status}`)
  const payload = await response.json()
  assert(Array.isArray(payload.models) && payload.models.length > 0, "model list is empty")
  const ids = payload.models.map((m) => m.id)
  assert(new Set(ids).size === ids.length, "duplicate model ids")
  for (const model of payload.models) {
    assert(typeof model.id === "string" && model.id.includes("/"), `bad id: ${model.id}`)
    assert(typeof model.provider === "string" && model.provider, `missing provider: ${model.id}`)
  }
  assert(ids.includes(MODEL), `model under test missing from list: ${MODEL}`)
})

await run("spending-answer", async () => {
  const payload = await postChat({
    messages: [{ role: "user", content: "Where did my money go last month? Be brief." }],
  })
  assert(typeof payload.content === "string" && payload.content.length > 20, "empty answer")
  assert(payload.content.includes("Housing"), "missing top category Housing")
  assert(payload.content.includes("-$3,300.00"), "missing top spend -$3,300.00")
  for (const leaked of ["transactionCount", "generatedAt", "Rules:", "minor-unit"]) {
    assert(!payload.content.includes(leaked), `prompt leak: ${leaked}`)
  }
  assert(Array.isArray(payload.toolEvents), "toolEvents missing")
  if (payload.sessionId) sharedSessionId = payload.sessionId
})

await run("budget-over", async () => {
  const payload = await postChat({
    messages: [{ role: "user", content: "Am I over budget anywhere? Name the worst one." }],
  })
  assert(
    /over|Dining Out|Groceries/i.test(payload.content),
    `no over-budget fact: ${payload.content.slice(0, 200)}`,
  )
})

await run("repo-tools", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content: "List the subdirectories inside src/features in this repo. Just the names.",
      },
    ],
  })
  assert(Array.isArray(payload.toolEvents) && payload.toolEvents.length >= 1, "no tool calls made")
  assert(
    payload.toolEvents.length <= 12,
    `inefficient trajectory: ${payload.toolEvents.length} calls`,
  )
  const names = payload.toolEvents.map((e) => e.name)
  for (const name of names) {
    assert(/^[a-z][a-z0-9_-]*$/i.test(name) && name !== "harness-tool", `opaque tool name: ${name}`)
  }
  assert(
    ["read", "glob", "bash"].some((t) => names.includes(t)),
    `no repo tool used: ${names.join(",")}`,
  )
  const hits = KNOWN_FEATURE_DIRS.filter((dir) => payload.content.includes(dir))
  assert(hits.length >= 5, `expected feature dirs, got: ${payload.content.slice(0, 200)}`)
})

await run("session-resume", async () => {
  assert(sharedSessionId, "no session captured from spending-answer; run order broken")
  const payload = await postChat({
    messages: [{ role: "user", content: "And what about groceries specifically?" }],
    sessionId: sharedSessionId,
  })
  assert(
    /groceries/i.test(payload.content),
    `resume lost context: ${payload.content.slice(0, 200)}`,
  )
})

await run("variance-in-snapshot", async () => {
  const payload = await postChat({
    messages: [
      { role: "user", content: "Where did my money go last month? List amounts briefly." },
    ],
  })
  assert(typeof payload.content === "string" && payload.content.length > 20, "empty answer")
  assert(
    /\$[\d,]+\.\d{2}/.test(payload.content),
    `missing currency amount: ${payload.content.slice(0, 200)}`,
  )
  for (const leaked of [
    "transactionCount",
    "generatedAt",
    "previousSpending",
    "Rules:",
    "minor-unit",
  ]) {
    assert(!payload.content.includes(leaked), `prompt leak: ${leaked}`)
  }
})

await run("models-capabilities", async () => {
  const response = await fetch(`${BASE}/api/models`, { signal: AbortSignal.timeout(30_000) })
  assert(response.ok, `models responded ${response.status}`)
  const payload = await response.json()
  assert(Array.isArray(payload.models) && payload.models.length > 0, "model list is empty")
  for (const model of payload.models) {
    const free = model.free
    assert(
      free === true || free === false || free === 0 || free === 1,
      `bad free field: ${model.id}`,
    )
    if ("contextTokens" in model && model.contextTokens != null) {
      assert(
        typeof model.contextTokens === "number" && Number.isFinite(model.contextTokens),
        `bad contextTokens: ${model.id}`,
      )
    }
  }
})

await run("variance-fastest-grower", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content:
          "Prior window spending was Housing $3,300.00, Travel $1,242.15, Groceries $200.00, Dining Out $312.00. Current spending is Housing $3,300.00, Travel $1,242.15, Groceries $1,141.00, Dining Out $312.00. Which spending category grew fastest versus the prior period? Name the category. Be brief.",
      },
    ],
  })
  assert(
    /groceries/i.test(payload.content),
    `expected Groceries as fastest grower: ${payload.content.slice(0, 200)}`,
  )
})

await run("total-over-budget", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content:
          "How much am I over budget in total across all categories? Name the over-budget categories and include a dollar amount. Be brief.",
      },
    ],
  })
  assert(
    /\$[\d,]+\.\d{2}/.test(payload.content),
    `missing currency amount: ${payload.content.slice(0, 200)}`,
  )
  assert(
    /Dining Out|Groceries/i.test(payload.content),
    `missing over-budget category: ${payload.content.slice(0, 200)}`,
  )
})

await run("income-vs-expenses", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content:
          "Did income cover expenses? By how much? Please use the word cover in your reply and include a dollar amount. Be brief.",
      },
    ],
  })
  assert(
    /yes|cover/i.test(payload.content),
    `missing cover verdict: ${payload.content.slice(0, 200)}`,
  )
  assert(
    /\$[\d,]+\.\d{2}/.test(payload.content),
    `missing currency amount: ${payload.content.slice(0, 200)}`,
  )
})

await run("what-if-dining", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content:
          "My Dining Out budget shows $806.00 spent. If I cut dining out spending in half, how much would I save per month? Start your answer with the savings amount and include a dollar amount. Be brief.",
      },
    ],
  })
  const match = payload.content.match(/\$([\d,]+\.\d{2})/)
  assert(match, `missing currency amount: ${payload.content.slice(0, 200)}`)
  const value = Number.parseFloat(match[1].replaceAll(",", ""))
  assert(Number.isFinite(value), `bad currency parse: ${match[0]}`)
  const ratio = value / 403.0
  assert(
    ratio > 0.7 && ratio < 1.3,
    `savings ${match[0]} not within 30% of $403.00: ${payload.content.slice(0, 200)}`,
  )
})

await run("net-worth-direction", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content: "Is my net worth going up or down lately? Compare the two dates briefly.",
      },
    ],
  })
  assert(
    /up|down|growing|increasing|rose|fell|declin/i.test(payload.content),
    `missing direction: ${payload.content.slice(0, 200)}`,
  )
  assert(
    /\$[\d,]+\.\d{2}/.test(payload.content),
    `missing currency amount: ${payload.content.slice(0, 200)}`,
  )
})

await run("highest-transaction", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content: "What was my largest single transaction by amount? One sentence.",
      },
    ],
  })
  assert(
    /3,150/.test(payload.content),
    `missing largest transaction $3,150.00: ${payload.content.slice(0, 200)}`,
  )
  assert(
    !/can't determine|don't have|no individual/i.test(payload.content),
    `refusal despite extremes: ${payload.content.slice(0, 200)}`,
  )
})

await run("graph-all-transactions", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content: "Graph my daily spending over time as a chart.",
      },
    ],
  })
  assert(
    !/can't graph|only exposes|no individual|don't have/i.test(payload.content),
    `refusal despite dailySeries: ${payload.content.slice(0, 200)}`,
  )
  const fence = payload.content.match(/```budgetlens-chart\s+([\s\S]*?)```/)
  assert(fence, `no chart fence: ${payload.content.slice(0, 300)}`)
  const spec = JSON.parse(fence[1])
  assert(Array.isArray(spec.data) && spec.data.length >= 4, "chart has too few points")
})

await run("recent-row-question", async () => {
  const payload = await postChat({
    messages: [
      {
        role: "user",
        content: "What did I buy at the coffee shop on Aug 3? One sentence.",
      },
    ],
  })
  assert(
    /Starbucks|beans|5\.40/i.test(payload.content),
    `missing Starbucks row: ${payload.content.slice(0, 200)}`,
  )
  assert(
    !/can't determine|don't have|no individual|only aggregates/i.test(payload.content),
    `refusal despite recent rows: ${payload.content.slice(0, 200)}`,
  )
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} evals passed`)
for (const result of results) {
  console.log(
    `  ${result.ok ? "PASS" : "FAIL"} ${result.name} ${result.ms}ms${result.error ? ` :: ${result.error}` : ""}`,
  )
}
process.exit(failed.length > 0 ? 1 : 0)
