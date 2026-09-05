// Eval for assistant chart fences (```budgetlens-chart).
//
// What it checks (no LLM judge, no extra deps):
//   - POST /api/chat answers a chart request with a parseable
//     ```budgetlens-chart fence whose data labels match the snapshot (>=2).
//
// Requires `pnpm dev` and `opencode serve` running locally, then:
//   node evals/assistant-charts.eval.mjs
// Options via env:
//   ASSISTANT_BASE=http://localhost:5173 (dev server origin)
//   ASSISTANT_MODEL=opencode/muse-spark-1.3-contributor-free (model under test)

const BASE = process.env.ASSISTANT_BASE ?? "http://localhost:5173"
const MODEL = process.env.ASSISTANT_MODEL ?? "opencode/muse-spark-1.3-contributor-free"
const REQUEST_TIMEOUT_MS = 240_000

const SNAPSHOT = {
  generatedAt: "2026-09-05T00:00:00.000Z",
  transactionCount: 18,
  spending: [
    { category: "Housing", count: 2, totalMinor: -330000, total: "-$3,300.00" },
    { category: "Travel", count: 4, totalMinor: -124215, total: "-$1,242.15" },
    { category: "Groceries", count: 12, totalMinor: -114100, total: "-$1,141.00" },
  ],
  budgets: [],
  netWorth: [],
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isRecord(value) {
  return typeof value === "object" && value !== null
}

function extractChartFence(content) {
  const match = content.match(/```budgetlens-chart\s*\n([\s\S]*?)```/)
  assert(match, `no \`\`\`budgetlens-chart fence found: ${content.slice(0, 300)}`)
  const raw = (match[1] ?? "").trim()
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`chart fence JSON did not parse: ${raw.slice(0, 300)}`)
  }
  assert(isRecord(parsed), "chart fence JSON is not an object")
  assert(
    parsed.type === "bar" || parsed.type === "donut",
    `bad chart type: ${String(parsed.type).slice(0, 40)}`,
  )
  assert(typeof parsed.title === "string" && parsed.title.trim(), "chart is missing a title")
  assert(Array.isArray(parsed.data) && parsed.data.length >= 2, "chart needs >= 2 slices")
  return parsed
}

async function postChat({ messages }) {
  const response = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, snapshot: SNAPSHOT, model: MODEL }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload = await response.json()
  assert(response.ok, `chat responded ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`)
  return payload
}

const started = Date.now()
try {
  const payload = await postChat({
    messages: [{ role: "user", content: "Show a bar chart of spending by category." }],
  })
  assert(typeof payload.content === "string" && payload.content.length > 20, "empty answer")
  const chart = extractChartFence(payload.content)
  const expected = new Set(SNAPSHOT.spending.map((row) => row.category.toLowerCase()))
  const labels = chart.data
    .filter((row) => isRecord(row) && typeof row.label === "string")
    .map((row) => row.label.toLowerCase())
  const hits = labels.filter((label) => expected.has(label))
  assert(
    hits.length >= 2,
    `chart labels ${JSON.stringify(labels).slice(0, 200)} do not match snapshot categories`,
  )
  console.log(`PASS assistant-charts (${Date.now() - started}ms)`)
  process.exit(0)
} catch (error) {
  console.log(`FAIL assistant-charts: ${String(error).slice(0, 400)}`)
  console.log(`FAIL assistant-charts (${Date.now() - started}ms)`)
  process.exit(1)
}
