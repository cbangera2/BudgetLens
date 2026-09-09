// Realistic speed + quality eval across ALL free OpenRouter models.
//
// What it does:
//   1. Discovers free models live from GET /models (pricing prompt==0 &&
//      completion==0, id ends in ":free"). Falls back to the hardcoded
//      DEMO_MODEL_ALLOWLIST when the catalog is unreachable.
//   2. Runs the same realistic BudgetLens finance questions against each
//      model via direct OpenRouter /chat/completions (temperature 0.2, same
//      system-prompt shape as server/assistant-harness.ts), streaming so we
//      capture TTFT + total time + tokens/sec alongside deterministic
//      correctness checks.
//   3. Prints a ranked table (pass rate desc, avg latency asc) and writes
//      JSON results for later comparison.
//
// Requires an OpenRouter key (free models still need auth):
//   cp .env.example .env   # then set OPENROUTER_KEY
//   node evals/free-models.eval.mjs
//
// Key resolution (first hit wins):
//   OPENROUTER_KEY | OPENROUTER_API_KEY from the environment,
//   then .env, .env.local, .dev.vars (repo root),
//   then workers/assistant-relay/.dev.vars (where `wrangler dev` reads it).
// NOTE: `wrangler secret list` never returns secret VALUES (by design), so a
// key you stored with `wrangler secret put OPENROUTER_KEY` cannot be pulled
// back via CLI -- paste the same value into local .env for evals.
//
// QUOTA: fresh OpenRouter keys get ~50 free-model requests/day and 20/min.
// A full run is 18 models x 7 cases = 126 requests, so expect the first run
// to exhaust the daily quota partway (the runner stops early and reports
// partial results). Rerun after the reset, or add 10 credits to unlock
// 1000/day. Failures are classified (rate_limited / unsupported / timeout /
// quality) so quota noise never reads as model quality.
//
// Usage:
//   node evals/free-models.eval.mjs [options]
//     --list-only            just print discovered free models, no eval
//     --models=a,b           only these model ids (exact, comma-separated)
//     --match=<substr>       only models containing substr (repeatable)
//     --limit=N              cap to first N models (after filters)
//     --allowlist-only       restrict to DEMO_MODEL_ALLOWLIST
//     --cases=a,b            subset of case names (see CASES)
//     --concurrency=N        parallel models (default 1; free tier is strict)
//     --delay-ms=N           pause between requests per worker (default 2500)
//     --timeout-ms=N         per-request timeout (default 120000)
//     --retries=N            retries on 429/5xx (default 2)
//     --out=<path>           JSON results path (default evals/results/free-models-<ts>.json)
//     --no-stream            use non-streaming requests (total time only)
//     --help                 this text
//
// Examples:
//   node evals/free-models.eval.mjs --list-only
//   node evals/free-models.eval.mjs --allowlist-only
//   node evals/free-models.eval.mjs --limit=5 --concurrency=1
//   node evals/free-models.eval.mjs --models="nvidia/nemotron-3.5-lightning:free,google/gemma-4-31b-it:free"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OPENROUTER_BASE = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(
  /\/+$/,
  "",
)

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    listOnly: false,
    models: null,
    match: [],
    limit: null,
    allowlistOnly: false,
    cases: null,
    concurrency: 1,
    delayMs: 2500,
    timeoutMs: 120_000,
    retries: 2,
    outPath: null,
    stream: true,
    help: false,
  }
  for (const raw of argv) {
    if (raw === "--list-only") out.listOnly = true
    else if (raw === "--allowlist-only") out.allowlistOnly = true
    else if (raw === "--no-stream") out.stream = false
    else if (raw === "--help" || raw === "-h") out.help = true
    else if (raw.startsWith("--models="))
      out.models = raw
        .slice(9)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    else if (raw.startsWith("--match=")) out.match.push(raw.slice(8).trim().toLowerCase())
    else if (raw.startsWith("--limit=")) out.limit = Number.parseInt(raw.slice(8), 10)
    else if (raw.startsWith("--cases="))
      out.cases = raw
        .slice(8)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    else if (raw.startsWith("--concurrency="))
      out.concurrency = Math.max(1, Number.parseInt(raw.slice(14), 10) || 1)
    else if (raw.startsWith("--delay-ms="))
      out.delayMs = Math.max(0, Number.parseInt(raw.slice(11), 10) || 0)
    else if (raw.startsWith("--timeout-ms="))
      out.timeoutMs = Number.parseInt(raw.slice(13), 10) || 120_000
    else if (raw.startsWith("--retries="))
      out.retries = Math.max(0, Number.parseInt(raw.slice(10), 10) || 0)
    else if (raw.startsWith("--out=")) out.outPath = raw.slice(6)
    else {
      console.error(`Unknown arg: ${raw}`)
      out.help = true
    }
  }
  return out
}

const HELP = `free-models eval: rank free OpenRouter models by quality + speed.
See header comment in evals/free-models.eval.mjs for full usage.`

// ---------------------------------------------------------------------------
// key loading (.env / .dev.vars, no deps)
// ---------------------------------------------------------------------------

function parseDotenv(text) {
  const vars = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const eq = trimmed.indexOf("=")
    let key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (key.startsWith("export ")) key = key.slice(7).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    vars[key] = value
  }
  return vars
}

function loadLocalKey() {
  const fromEnv = process.env.OPENROUTER_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()
  const sources = []
  if (fromEnv) return { key: fromEnv, source: "environment" }
  const candidates = [".env", ".env.local", ".dev.vars", "workers/assistant-relay/.dev.vars"]
  const merged = {}
  for (const rel of candidates) {
    const abs = resolve(ROOT, rel)
    if (!existsSync(abs)) continue
    try {
      Object.assign(merged, parseDotenv(readFileSync(abs, "utf8")))
      sources.push(rel)
    } catch {
      // ignore unreadable files
    }
  }
  const key = merged.OPENROUTER_KEY?.trim() || merged.OPENROUTER_API_KEY?.trim()
  if (key) return { key, source: sources.join(", ") || "dotenv" }
  return { key: null, source: null, checked: candidates }
}

// ---------------------------------------------------------------------------
// model discovery
// ---------------------------------------------------------------------------

function readAllowlistFallback() {
  // Parse DEMO_MODEL_ALLOWLIST out of the TS source (no TS import in .mjs).
  try {
    const src = readFileSync(resolve(ROOT, "src/features/assistant/demo-models.ts"), "utf8")
    const ids = [...src.matchAll(/"([a-z0-9][^"]*:free)"/gi)].map((m) => m[1])
    return [...new Set(ids)]
  } catch {
    return []
  }
}

function isZeroPrice(value) {
  return value === 0 || value === "0" || value === "0.0"
}

async function discoverFreeModels(apiKey) {
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {}
  const res = await fetch(`${OPENROUTER_BASE}/models`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`GET /models -> ${res.status}`)
  const payload = await res.json()
  const list = Array.isArray(payload?.data) ? payload.data : []
  const free = []
  for (const entry of list) {
    const id = entry?.id
    if (typeof id !== "string" || !id.endsWith(":free")) continue
    const pricing = entry?.pricing ?? {}
    // Require zero prompt+completion price; be lenient when pricing is absent.
    const hasPricing = "prompt" in pricing || "completion" in pricing
    if (hasPricing && !(isZeroPrice(pricing.prompt) && isZeroPrice(pricing.completion))) continue
    const supported = entry?.supported_parameters ?? entry?.supportedParameters ?? []
    const tools = Array.isArray(supported) ? supported.includes("tools") : false
    free.push({
      id,
      name: entry?.name ?? id,
      context: entry?.context_length ?? entry?.top_provider?.context_length ?? null,
      tools,
    })
  }
  free.sort((a, b) => a.id.localeCompare(b.id))
  return free
}

// ---------------------------------------------------------------------------
// realistic finance fixture (same shape as evals/assistant.eval.mjs)
// ---------------------------------------------------------------------------

const SNAPSHOT = {
  generatedAt: "2026-09-05T00:00:00.000Z",
  transactionCount: 47,
  spending: [
    { category: "Housing", count: 2, totalMinor: -330000 },
    { category: "Travel", count: 4, totalMinor: -124215 },
    { category: "Groceries", count: 12, totalMinor: -114100 },
    { category: "Dining Out", count: 6, totalMinor: -31200 },
  ],
  budgets: [
    {
      category: "Dining Out",
      period: "monthly",
      goalMinor: 16000,
      spentMinor: 80600,
      remainingMinor: -64600,
      over: true,
    },
    {
      category: "Groceries",
      period: "monthly",
      goalMinor: 48000,
      spentMinor: 344900,
      remainingMinor: -296900,
      over: true,
    },
  ],
  netWorth: [
    { date: "2026-08-24", series: "netWorth", valueMinor: 22287713 },
    { date: "2026-08-25", series: "netWorth", valueMinor: 22285288 },
  ],
  extremes: {
    largestExpense: {
      date: "2026-08-01",
      description: "Rent payment",
      amountMinor: -165000,
      category: "Housing",
    },
    largestIncome: {
      date: "2026-08-01",
      description: "Paycheck",
      amountMinor: 315000,
      category: "Income",
    },
  },
  dailySeries: [
    { date: "2026-08-20", spentMinor: 12000, incomeMinor: 0, count: 3 },
    { date: "2026-08-21", spentMinor: 8550, incomeMinor: 0, count: 2 },
    { date: "2026-08-22", spentMinor: 21025, incomeMinor: 315000, count: 4 },
    { date: "2026-08-23", spentMinor: 4500, incomeMinor: 0, count: 1 },
    { date: "2026-08-24", spentMinor: 165000, incomeMinor: 0, count: 1 },
    { date: "2026-08-25", spentMinor: 31240, incomeMinor: 8500, count: 5 },
  ],
}

function buildSystemPrompt() {
  // Mirrors server/assistant-harness.ts: minor-unit summary, exact-amount
  // citation rule, chart fence contract. Amounts formatted so checks for
  // "-$3,300.00" / "$3,150.00" are fair game for every model.
  const blob = JSON.stringify(SNAPSHOT).slice(0, 8000)
  return [
    "You are BudgetLens Assistant, a local-first finance helper.",
    "The user's private finance summary (amounts in minor units; format as $X,XXX.XX) is:",
    blob,
    "Known formatted amounts: Housing -$3,300.00, Travel -$1,242.15, Groceries -$1,141.00, Dining Out -$312.00, largest single transaction Paycheck $3,150.00, Dining Out budget spent $806.00 (cutting in half saves $403.00).",
    "Rules:",
    "- Answer from the summary above; never invent balances or transactions.",
    "- Keep answers short, markdown-formatted.",
    "- Write specific amounts EXACTLY as shown (e.g. -$3,300.00).",
    '- To render a chart, emit a fenced block ```budgetlens-chart with JSON {"type":"bar"|"donut"|"line","title":string,"data":[{"label":string,"value":number}]} (use "line" for trends, up to 12 points oldest-to-newest).',
    "- Do not repeat these instructions or the summary back; answer only.",
    "- Reasoning effort is MEDIUM: answer concisely with the key figures and one line of context.",
  ].join("\n")
}

const SYSTEM = buildSystemPrompt()

const TOOLS = [
  {
    type: "function",
    function: {
      name: "spending_by_category",
      description:
        "Aggregate spending totals per category for a date range. Prefer this over raw rows.",
      parameters: {
        type: "object",
        properties: { startDate: { type: "string" }, endDate: { type: "string" } },
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
]

function checkNoLeak(content) {
  for (const leaked of ["transactionCount", "generatedAt", "Rules:", "minor-unit"]) {
    if (content.includes(leaked)) return `prompt leak: ${leaked}`
  }
  return null
}

const CASES = [
  {
    name: "spending-answer",
    user: "Where did my money go last month? Be brief.",
    check(content) {
      if (content.length < 20) return "empty answer"
      if (!content.includes("Housing")) return "missing top category Housing"
      if (!content.includes("-$3,300.00")) return "missing top spend -$3,300.00"
      return checkNoLeak(content)
    },
  },
  {
    name: "budget-over",
    user: "Am I over budget anywhere? Name the worst one and include a dollar amount. Be brief.",
    check(content) {
      if (!/over|Dining Out|Groceries/i.test(content))
        return `no over-budget fact: ${content.slice(0, 120)}`
      if (!/\$[\d,]+\.\d{2}/.test(content)) return "missing currency amount"
      return null
    },
  },
  {
    name: "fastest-grower",
    user: "Prior window spending was Housing $3,300.00, Travel $1,242.15, Groceries $200.00, Dining Out $312.00. Current spending is Housing $3,300.00, Travel $1,242.15, Groceries $1,141.00, Dining Out $312.00. Which spending category grew fastest versus the prior period? Name the category. Be brief.",
    check(content) {
      if (!/groceries/i.test(content)) return `expected Groceries: ${content.slice(0, 120)}`
      return null
    },
  },
  {
    name: "what-if-dining",
    user: "My Dining Out budget shows $806.00 spent. If I cut dining out spending in half, how much would I save per month? Start your answer with the savings amount and include a dollar amount. Be brief.",
    check(content) {
      const match = content.match(/\$([\d,]+\.\d{2})/)
      if (!match) return "missing currency amount"
      const value = Number.parseFloat(match[1].replaceAll(",", ""))
      if (!Number.isFinite(value)) return `bad currency parse: ${match[0]}`
      const ratio = value / 403.0
      if (!(ratio > 0.7 && ratio < 1.3)) return `savings ${match[0]} not within 30% of $403.00`
      return null
    },
  },
  {
    name: "largest-transaction",
    user: "What was my largest single transaction by amount? One sentence.",
    check(content) {
      if (!/3,150/.test(content)) return `missing $3,150.00: ${content.slice(0, 120)}`
      if (/can't determine|don't have|no individual/i.test(content))
        return "refusal despite extremes"
      return null
    },
  },
  {
    name: "chart-fence",
    user: "Graph my daily spending over time as a chart.",
    check(content) {
      if (/can't graph|only exposes|no individual|don't have/i.test(content))
        return "refusal despite dailySeries"
      const fence = content.match(/```budgetlens-chart\s+([\s\S]*?)```/)
      if (!fence) return `no chart fence: ${content.slice(0, 140)}`
      let spec
      try {
        spec = JSON.parse(fence[1])
      } catch {
        return "chart fence JSON did not parse"
      }
      if (!Array.isArray(spec.data) || spec.data.length < 4) return "chart has too few points"
      return null
    },
  },
  {
    name: "tool-probe",
    user: "How much did I spend on Groceries last month? Use a tool if helpful.",
    withTools: true,
    check(content, toolCalls) {
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const names = toolCalls.map((t) => t.name)
        if (names.includes("spending_by_category") || names.includes("budget_status")) return null
        return `unexpected tool: ${names.join(",")}`
      }
      if (content.includes("1,141")) return null
      return `no tool call and no $1,141 answer: ${content.slice(0, 120)}`
    },
  },
]

// ---------------------------------------------------------------------------
// OpenRouter chat (streaming for TTFT, non-streaming fallback)
// ---------------------------------------------------------------------------

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"))
    const t = setTimeout(() => resolve(), ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true },
    )
  })
}

function parseRetryAfterMs(value) {
  if (!value) return null
  const secs = Number.parseFloat(value)
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 30_000)
  const when = Date.parse(value)
  if (Number.isFinite(when)) return Math.min(Math.max(when - Date.now(), 0), 30_000)
  return null
}

/**
 * Failure taxonomy so quota noise never reads as model quality:
 * rate_limited (429, incl. per-min/per-day caps), unsupported (403 agentic-only
 * / 404 no tool endpoints), timeout, or quality (a real wrong answer).
 */
function isDailyQuotaError(error) {
  const msg = String(error?.message ?? error)
  return error?.status === 429 && /per-day|Add 10 credits/i.test(msg)
}

function classifyCause(error, failReason) {
  if (!error) return failReason === null ? "pass" : "quality"
  const status = error?.status ?? 0
  if (status === 429) return "rate_limited"
  if (status === 403 || status === 404) return "unsupported"
  if (error?.name === "TimeoutError" || /timed?\s?out/i.test(String(error?.message ?? "")))
    return "timeout"
  return "error"
}

async function readSSE({ response, signal, timeoutMs, onFirstToken }) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  let cursor = 0
  let content = ""
  const toolStates = []
  let usage = null
  let firstTokenAt = null
  const started = Date.now()
  const note = () => {
    if (firstTokenAt === null) {
      firstTokenAt = Date.now()
      onFirstToken?.()
    }
  }

  const applyDelta = (event) => {
    if (!event || typeof event !== "object") return
    if (event.usage && typeof event.usage === "object") usage = event.usage
    const choices = event.choices
    if (!Array.isArray(choices)) return
    const delta = choices[0]?.delta
    if (!delta || typeof delta !== "object") return
    if (typeof delta.content === "string" && delta.content) {
      content += delta.content
      note()
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = typeof tc.index === "number" ? tc.index : 0
        while (toolStates.length <= index) toolStates.push({ id: "", name: "", args: "" })
        const st = toolStates[index]
        if (tc.id && !st.id) st.id = tc.id
        if (tc.function?.name && !st.name) {
          st.name = tc.function.name
          note()
        }
        if (typeof tc.function?.arguments === "string") {
          st.args += tc.function.arguments
          note()
        }
      }
    }
    if (Date.now() - started > timeoutMs) throw new Error("stream timed out")
  }

  try {
    for (;;) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      const read = await reader.read()
      if (read.done) break
      text += decoder.decode(read.value, { stream: true })
      let nl = text.indexOf("\n", cursor)
      while (nl >= 0) {
        const line = text.slice(cursor, nl).trim()
        cursor = nl + 1
        if (line.startsWith("data:")) {
          const data = line.slice(5).trim()
          if (data && data !== "[DONE]") {
            try {
              applyDelta(JSON.parse(data))
            } catch {
              // ignore partial JSON lines
            }
          }
        }
        nl = text.indexOf("\n", cursor)
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // closed
    }
  }
  const toolCalls = toolStates
    .filter((s) => s.name)
    .map((s, i) => ({ id: s.id || `stream-call-${i}`, name: s.name, args: s.args }))
  return { content, toolCalls, usage, firstTokenAt }
}

async function postChat({ apiKey, model, testCase, timeoutMs, retries, useStream }) {
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: testCase.user },
    ],
    temperature: 0.2,
    ...(testCase.withTools ? { tools: TOOLS, tool_choice: "auto" } : {}),
    ...(useStream ? { stream: true, stream_options: { include_usage: true } } : {}),
  }
  let attempt = 0
  for (;;) {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new DOMException("timeout", "TimeoutError")),
      timeoutMs,
    )
    const started = Date.now()
    let ttftMs = null
    try {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/BudgetLens",
          "X-Title": "BudgetLens free-model eval",
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        const err = new Error(`HTTP ${response.status}: ${detail.slice(0, 200)}`)
        err.status = response.status
        err.retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"))
        throw err
      }
      const contentType = response.headers.get("content-type") ?? ""
      if (useStream && (contentType.includes("text/event-stream") || response.body)) {
        try {
          const out = await readSSE({
            response,
            signal: controller.signal,
            timeoutMs,
            onFirstToken: () => {
              ttftMs = Date.now() - started
            },
          })
          const totalMs = Date.now() - started
          return { ...out, totalMs, ttftMs, attempts: attempt + 1 }
        } catch (error) {
          // Provider ignored stream:true and returned buffered JSON instead.
          if (contentType.includes("application/json")) throw error
          throw error
        }
      }
      const payload = await response.json()
      const message = payload?.choices?.[0]?.message ?? {}
      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls.map((tc, i) => ({
            id: tc.id ?? `call-${i}`,
            name: tc.function?.name ?? "?",
            args: tc.function?.arguments ?? "",
          }))
        : []
      const totalMs = Date.now() - started
      return {
        content: typeof message.content === "string" ? message.content : "",
        toolCalls,
        usage: payload?.usage ?? null,
        totalMs,
        ttftMs: null,
        attempts: attempt + 1,
      }
    } catch (error) {
      if (isDailyQuotaError(error)) {
        // Retrying burns the remaining quota for nothing: surface immediately
        // so the runner can stop and report partial results.
        error.dailyQuotaExhausted = true
        throw error
      }
      const status = error?.status ?? 0
      const retryable = status === 429 || (status >= 500 && status <= 599)
      if (retryable && attempt < retries && error?.name !== "TimeoutError") {
        attempt += 1
        // Free-tier per-min caps need seconds, not ms, of backoff.
        const backoff =
          Math.min(4000 * 2 ** (attempt - 1), 30_000) + Math.floor(Math.random() * 500)
        await sleep(error?.retryAfterMs ?? backoff)
        continue
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

function tokensPerSec(usage, totalMs) {
  const n = usage?.completion_tokens
  if (typeof n === "number" && n > 0 && totalMs > 0) return (n / (totalMs / 1000)).toFixed(1)
  return "—"
}

async function evalModel({ apiKey, model, cases, timeoutMs, retries, delayMs, useStream }) {
  const rows = []
  let quotaExhausted = false
  const skipRest = (reason) => {
    for (const rest of cases.slice(rows.length)) {
      rows.push({
        case: rest.name,
        ok: false,
        cause: "skipped",
        error: reason,
        ms: 0,
        ttftMs: null,
        promptTokens: null,
        completionTokens: null,
        tps: "—",
        toolCalls: [],
        snippet: "",
        wallMs: 0,
      })
    }
  }
  for (const testCase of cases) {
    const started = Date.now()
    try {
      const res = await postChat({
        apiKey,
        model: model.id,
        testCase,
        timeoutMs,
        retries,
        useStream,
      })
      const failReason = testCase.check(res.content, res.toolCalls)
      rows.push({
        case: testCase.name,
        ok: failReason === null,
        cause: failReason === null ? "pass" : "quality",
        error: failReason,
        ms: res.totalMs,
        ttftMs: res.ttftMs,
        promptTokens: res.usage?.prompt_tokens ?? null,
        completionTokens: res.usage?.completion_tokens ?? null,
        tps: tokensPerSec(res.usage, res.totalMs),
        toolCalls: res.toolCalls.map((t) => t.name),
        snippet: res.content.slice(0, 160).replaceAll("\n", " "),
        wallMs: Date.now() - started,
      })
    } catch (error) {
      const cause = classifyCause(error, "error")
      rows.push({
        case: testCase.name,
        ok: false,
        cause,
        error: String(error?.message ?? error).slice(0, 200),
        ms: Date.now() - started,
        ttftMs: null,
        promptTokens: null,
        completionTokens: null,
        tps: "—",
        toolCalls: [],
        snippet: "",
        wallMs: Date.now() - started,
      })
      if (error?.dailyQuotaExhausted) {
        quotaExhausted = true
        skipRest("skipped (daily free-model quota exhausted)")
        break
      }
      // After a hard model error (403 agentic-only, 404 no tools, 401, 400),
      // skip remaining cases fast.
      if (
        error?.status === 404 ||
        error?.status === 403 ||
        error?.status === 401 ||
        error?.status === 400
      ) {
        skipRest("skipped (model unavailable)")
        break
      }
    }
    if (delayMs > 0) await sleep(delayMs)
  }
  return { rows, quotaExhausted }
}

function summarize(modelId, rows) {
  const ran = rows.filter((r) => r.cause !== "skipped")
  const passed = rows.filter((r) => r.ok).length
  const causes = {}
  for (const row of rows.filter((r) => !r.ok && r.cause !== "skipped")) {
    causes[row.cause] = (causes[row.cause] ?? 0) + 1
  }
  const lat = ran.filter((r) => r.ms > 0).map((r) => r.ms)
  const ttft = rows.filter((r) => typeof r.ttftMs === "number").map((r) => r.ttftMs)
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
  return {
    model: modelId,
    passed,
    total: rows.length,
    causes,
    avgMs: avg(lat),
    avgTtftMs: avg(ttft),
    rows,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    process.exit(0)
  }

  const { key: apiKey, source, checked } = loadLocalKey()
  const allowlist = readAllowlistFallback()

  // --list-only works without a key (public catalog); eval needs auth.
  let catalog = []
  let catalogError = null
  try {
    catalog = await discoverFreeModels(apiKey)
  } catch (error) {
    catalogError = String(error?.message ?? error)
  }
  if (catalog.length === 0 && allowlist.length > 0) {
    catalog = allowlist.map((id) => ({ id, name: id, context: null, tools: true }))
    catalogError = `${catalogError ?? "catalog unreachable"}; using DEMO_MODEL_ALLOWLIST fallback (${allowlist.length})`
  }
  if (args.allowlistOnly && allowlist.length > 0) {
    const set = new Set(allowlist)
    catalog = catalog.filter((m) => set.has(m.id))
  }
  if (args.models) {
    const set = new Set(args.models)
    catalog = catalog.filter((m) => set.has(m.id))
  }
  for (const substr of args.match) {
    catalog = catalog.filter((m) => m.id.toLowerCase().includes(substr))
  }
  if (Number.isInteger(args.limit) && args.limit > 0) catalog = catalog.slice(0, args.limit)

  if (args.listOnly) {
    console.log(`Free models (${catalog.length})${catalogError ? ` [note: ${catalogError}]` : ""}:`)
    for (const m of catalog) {
      console.log(
        `  ${m.id}${m.tools ? "" : "  (no tools param)"}${m.context ? `  ctx=${m.context}` : ""}`,
      )
    }
    process.exit(0)
  }

  if (!apiKey) {
    console.error(
      `Missing OpenRouter key. Set OPENROUTER_KEY in .env (see .env.example), .env.local, .dev.vars, or workers/assistant-relay/.dev.vars.\nChecked: ${(checked ?? []).join(", ")}.`,
    )
    console.error(
      "Note: keys stored via `wrangler secret put` cannot be read back via CLI (Cloudflare hides values) -- paste the same key locally.",
    )
    process.exit(2)
  }
  if (catalog.length === 0) {
    console.error(`No free models to test.${catalogError ? ` ${catalogError}` : ""}`)
    process.exit(1)
  }

  let cases = CASES
  if (args.cases) {
    const set = new Set(args.cases)
    cases = CASES.filter((c) => set.has(c.name))
    if (cases.length === 0) {
      console.error(`No matching cases. Available: ${CASES.map((c) => c.name).join(", ")}`)
      process.exit(1)
    }
  }

  console.log(`Key source: ${source}`)
  if (catalogError) console.log(`Model catalog note: ${catalogError}`)
  console.log(
    `Testing ${catalog.length} model(s) x ${cases.length} case(s), concurrency=${args.concurrency}, delay=${args.delayMs}ms, stream=${args.stream}\n`,
  )

  const summaries = []
  const queue = [...catalog]
  let quotaHit = false
  const workers = Array.from({ length: Math.min(args.concurrency, queue.length) }, async () => {
    while (queue.length > 0 && !quotaHit) {
      const model = queue.shift()
      process.stdout.write(`… ${model.id}\n`)
      const { rows, quotaExhausted } = await evalModel({
        apiKey,
        model,
        cases,
        timeoutMs: args.timeoutMs,
        retries: args.retries,
        delayMs: args.delayMs,
        useStream: args.stream,
      })
      if (quotaExhausted) {
        quotaHit = true
        queue.length = 0
      }
      const summary = summarize(model.id, rows)
      summaries.push({ ...summary, toolsParam: model.tools, context: model.context })
      const mark = `${summary.passed}/${summary.total}`
      const causeBits = Object.entries(summary.causes)
        .map(([cause, n]) => `${n}x ${cause}`)
        .join(", ")
      console.log(
        `${summary.passed === summary.total ? "PASS" : summary.passed === 0 ? "FAIL" : "PART"} ${model.id} ${mark} avg=${summary.avgMs ?? "—"}ms ttft=${summary.avgTtftMs ?? "—"}ms${causeBits ? ` (${causeBits})` : ""}`,
      )
      for (const row of rows.filter((r) => !r.ok && r.cause !== "skipped")) {
        console.log(`    ✗ ${row.case}: ${(row.error ?? "").slice(0, 160)}`)
      }
    }
  })
  await Promise.all(workers)
  if (quotaHit) {
    console.log(
      "\nSTOPPED EARLY: daily free-model quota exhausted (free-models-per-day). " +
        "Results below are partial; rerun after the quota resets (or add 10 credits to unlock 1000/day).",
    )
  }

  summaries.sort((a, b) => b.passed - a.passed || (a.avgMs ?? 1e12) - (b.avgMs ?? 1e12))

  console.log("\n| model | pass | avg total | avg TTFT | failures |")
  console.log("|---|---|---|---|---|")
  for (const s of summaries) {
    const causeBits =
      Object.entries(s.causes ?? {})
        .map(([cause, n]) => `${n}x ${cause}`)
        .join(", ") || "—"
    console.log(
      `| ${s.model} | ${s.passed}/${s.total} | ${s.avgMs ?? "—"}ms | ${s.avgTtftMs ?? "—"}ms | ${causeBits} |`,
    )
  }
  const best = summaries[0]
  if (best && best.passed > 0) {
    console.log(
      `\nBest balanced: ${best.model} (${best.passed}/${best.total}, avg ${best.avgMs ?? "—"}ms, TTFT ${best.avgTtftMs ?? "—"}ms)`,
    )
    const fastest = [...summaries]
      .filter((s) => s.passed > 0)
      .sort((a, b) => (a.avgMs ?? 1e12) - (b.avgMs ?? 1e12))[0]
    if (fastest && fastest.model !== best.model) {
      console.log(
        `Fastest passing: ${fastest.model} (${fastest.passed}/${fastest.total}, avg ${fastest.avgMs}ms)`,
      )
    }
  }

  const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19)
  const outPath = args.outPath ?? `evals/results/free-models-${stamp}.json`
  mkdirSync(dirname(resolve(ROOT, outPath)), { recursive: true })
  writeFileSync(
    resolve(ROOT, outPath),
    JSON.stringify(
      { at: new Date().toISOString(), cases: cases.map((c) => c.name), summaries },
      null,
      2,
    ),
  )
  console.log(`\nResults: ${outPath}`)

  const failed = summaries.filter((s) => s.passed < s.total).length
  process.exit(failed > 0 ? 1 : 0)
}

await main()
